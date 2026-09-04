# Pi-0.5 NPU 适配架构分析

## 一、整体目录结构

```
model_examples/Pi-0.5/
├── README.md                          # 项目总览文档
├── pi05.patch                         # 训练适配补丁（应用于 lerobot 仓）
├── inference/                         # 推理优化模块
│   ├── README.md                      # 推理优化说明
│   ├── lerobot_pi05_npu_inference_b74a551.patch  # 推理 NPU 优化补丁
│   └── test/
│       └── pi05_latency.py            # 推理时延测试脚本
├── openpi/
│   └── openpi.patch                   # OpenPI 上游适配补丁
├── lerobot/                           # LeRobot 官方仓库（git clone）
│   ├── pi05.patch                     # 同根目录补丁
│   ├── src/lerobot/policies/pi05/     # PI0.5 核心策略模块
│   └── test/                          # 训练脚本
└── test/
    ├── env_npu.sh                     # NPU 环境变量配置
    ├── train_full.sh                  # 全量精度训练脚本
    ├── train_performance.sh           # 性能测试脚本
    └── paligemma_weights_mod.sh       # Paligemma 权重路径替换脚本
```

## 二、核心架构模型

### 2.1 Pi-0.5 模型架构（双系统 VLA 模型）

Pi-0.5 是一款**视觉-语言-动作 (VLA)** 模型，采用层次化架构，核心思想是"prefix prefill + denoise 循环"：

```
┌─────────────────────────────────────────────────────────────┐
│                      PI05Policy                              │
│  (入口层：负责图像预处理、token 化、动作采样)                    │
├─────────────────────────────────────────────────────────────┤
│                      PI05Pytorch                             │
│  (核心模型层：flow-matching 动作采样、denoise 循环)            │
├─────────────────────────────────────────────────────────────┤
│                 PaliGemmaWithExpertModel                      │
│  (双塔模型：Paligemma 主干 + Action Expert 专家)              │
│  ┌───────────────────────┐  ┌──────────────────────────────┐ │
│  │  Paligemma (prefix)   │  │  Gemma Action Expert         │ │
│  │  ├── SigLIP Vision    │  │  (denoise 去噪)              │ │
│  │  ├── MultiModal Proj  │  │  ├── input_layernorm (AdaRMS)│ │
│  │  └── Gemma Language   │  │  ├── self_attn (QKV+PFA)    │ │
│  └───────────────────────┘  │  ├── post_attention (AdaRMS) │ │
│                              │  ├── mlp                     │ │
│                              │  └── norm (AdaRMS)           │ │
│                              └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**推理流程**：
1. **Prefix 阶段**：图像经过 SigLIP 视觉塔 + 多模态投影器，语言 token 经过 embedding，拼接后送入 Paligemma Language Model 做一次 prefix prefill，产出 KV cache
2. **Denoise 阶段**：以随机噪声为起点，将 KV cache 与 action token 送入 Action Expert (Gemma)，经过 AdaRMS 条件调制 + self-attention + MLP 的多次迭代（10 步 Euler 积分），逐步去噪得到最终动作

### 2.2 与 Pi0 的关键差异

| 特性 | π0 | π0.5 |
|------|-----|------|
| 时间条件 | 通过 `action_time_mlp_*` 拼接 | 通过 `time_mlp_*` 做 AdaRMS 条件 |
| AdaRMS | 不使用 | Action Expert 使用 |
| Tokenizer 长度 | 48 tokens | 200 tokens |
| 离散状态输入 | False (使用 `state_proj`) | True |
| 参数数量 | 更高（含 state embedding） | 更低（无 state embedding） |

## 三、模块详细分析

### 3.1 三层补丁体系

项目通过**三个独立的 patch 文件**实现不同层次的适配，每个 patch 职责清晰、互不重叠：

#### (1) `pi05.patch` / `lerobot/pi05.patch` — 训练适配

| 修改文件 | 变更内容 |
|----------|---------|
| `src/lerobot/configs/train.py` | `num_workers` 从 4 → 12 |
| `src/lerobot/optim/optimizers.py` | 替换 `torch.optim.AdamW` → `mindspeed.optimizer.adamw.AdamW`（NPU 融合优化器）；新增 `convert_tensor_to_python` 序列化 tensor 参数 |
| `src/lerobot/policies/act/modeling_act.py` | ACT 模型的 attention 添加 `need_weights=False` 适配 NPU |
| `src/lerobot/scripts/lerobot_train.py` | 导入 `torch_npu` + `transfer_to_npu`；DataLoader 参数优化（`persistent_workers=True`、`pin_memory=True`、`prefetch_factor=4`） |

#### (2) `openpi/openpi.patch` — OpenPI 上游适配

| 修改文件 | 变更内容 |
|----------|---------|
| `scripts/train_pytorch.py` | 导入 `torch_npu` 和 `transfer_to_npu` |
| `src/openpi/models/tokenizer.py` | 支持 `PALIGEMMA_TOKENIZER_PATH` 环境变量指定本地 tokenizer |
| `src/openpi/training/config.py` | 数据集字段映射适配 v3.0 格式；支持 `LIBERO_DATASET_REPO_ID`、`PYTORCH_WEIGHT_PATH` 环境变量 |
| `src/openpi/training/data_loader.py` | 更新 `lerobot_dataset` 导入路径 |

#### (3) `inference/lerobot_pi05_npu_inference_b74a551.patch` — 推理 NPU 深度优化

这是最核心的补丁，包含 ~2400 行变更，涉及 5 个文件的修改和 1 个新文件：

| 文件 | 行数 | 角色 |
|------|------|------|
| `factory.py` | ~10行 | 推理准备入口 |
| `configuration_pi05.py` | ~20行 | 推理图编译配置项 |
| **`modeling_pi05.py`** | **~1800行** | 核心 NPU 推理优化 |
| **`vision_siglip_npu.py`** | **~370行 (新增)** | NPU 视觉塔 |
| `pi_gemma.py` | ~15行 | dtype 对齐修复 |

### 3.2 核心模块：`modeling_pi05.py` 推理优化

这是整个适配最核心的文件，包含以下关键优化路径：

#### A. 推理优化入口与精度控制

```python
# prepare_inference_optimizations() — 统一推理准备入口
# 在 policy 加载权重并移动到目标设备后调用
# 控制三个维度：eager NPU 融合 / 图编译 / QKV 融合
```

- `_action_compute_dtype()`: 根据设备能力决定推理精度（NPU 上 bf16）
- `_prepare_action_compute_dtype()`: 统一调整 action expert 和 vision path 的推理 dtype
- 与 pi0 保持一致，推理阶段 vision path 可降为 bf16

#### B. QKV 权重融合 (`fuse_qkv_weights`)

```
传统路径:  hidden → q_proj() → query
           hidden → k_proj() → key      → 3次独立 Linear call
           hidden → v_proj() → value

融合路径:  hidden → qkv() → [query, key, value]  → 1次 Linear + split
```

- 对 Paligemma Language Model 和 Gemma Expert 的每一层 attention 执行 QKV 权重拼接
- 将 `q_proj/k_proj/v_proj` 三个独立 Linear 合并为单一 `qkv` Linear
- 减少推理循环中的矩阵乘法调用次数

#### C. NPU Prompt Flash Attention (PFA) 融合路径

```
_forward_npu_optimized() — 核心 eager NPU 推理路径
├── 入口条件检查 _can_use_npu_fused_inference()
│   ├── eval 模式
│   ├── NPU 设备
│   ├── QKV 已融合
│   └── torch_npu 可用
├── Mask 转换: bool/additive → int8 blocked (PFA 要求)
├── RoPE 缓存: 预计算 cos/sin 复用
├── 逐层循环:
│   ├── 融合 QKV 投影 (1次 Linear)
│   ├── NPU RoPE (npu_rotary_mul)
│   ├── NPU PFA (npu_prompt_flash_attention)  ← 替换标准 attention
│   ├── NPU RMSNorm (npu_rms_norm) 或 AdaRMS
│   └── NPU 融合残差 (npu_add_rms_norm)
└── 返回 KV cache (dict 格式)
```

关键算子替换：
- `torch.matmul + softmax` → `torch_npu.npu_prompt_flash_attention`
- 标准 RMSNorm → `torch_npu.npu_rms_norm`
- 标准 RoPE → `torch_npu.npu_rotary_mul`
- 残差连接 → `torch_npu.npu_add_rms_norm`

#### D. AdaRMS NPU 融合

```
传统 AdaRMS:
  dense(cond) → split(scale, shift, gate) → rms_norm(x) * (1+scale) + shift → gate * x

NPU 融合 AdaRMS:
  dense(cond) → split(scale, shift, gate)
  → npu_rms_norm(x, weight=1+scale)  ← 将 scale 融入 RMSNorm 的 gamma
  → + shift
  → gate * x
```

- 把 `1+scale` 作为 `npu_rms_norm` 的 gamma 参数，让 RMSNorm 同时完成归一化和缩放
- 减少一次逐元素乘法的 kernel launch 开销

#### E. 固定 10 步 Denoise 查找表

```python
_refresh_fixed_denoise_lookup_tables()
├── 预计算 10 步 timestep 表
├── 预计算 10 步 AdaRMS condition 表
├── 预计算 10 步 scale/shift/gate 调制表
│   ├── scale: 存为 RMSNorm 可直接消费的一维 1+scale
│   ├── shift: 存为广播形状 [1, 1, hidden]
│   └── gate: 存为广播形状 [1, 1, hidden]
└── 注册为 per-step/per-layer 独立 buffer
    └── _action_denoise_adarms_scale_weight_s{step}_l{layer}
    └── _action_denoise_adarms_shift_s{step}_l{layer}
    └── _action_denoise_adarms_gate_s{step}_l{layer}
```

目的：图编译 denoise 路径直接消费预制表，跳过每层 `dense(cond)` 的计算，减少 GatherV2 操作。

#### F. TorchAir 双图编译

```
推理流程拆分为两张独立编译图:

┌──────────────────────────────────────────────────────┐
│  Prefix 图 (_action_prefix_forward_for_compile)       │
│  images, tokens → embed → prefix prefill → KV cache  │
│  编译一次，产出 KV cache（在 denoise 阶段只读复用）     │
└──────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────┐
│  Denoise 10步图 (_action_denoise_10_steps_for_compile)│
│  noise + KV cache + 预计算表 → 10步 Euler 积分 → action│
│  整体编译为一张图，10 步展开在编译图内部               │
└──────────────────────────────────────────────────────┘
```

图编译的支撑措施：
- `_force_eager_attention_for_graph_compile()`: 强制使用自定义 eager attention kernel（`eager_bmm`），避免 TorchAir/GE 对 SDPA 的 shape infer 问题
- `_patch_linear_for_npu_graph_compile()`: 将 rank>2 的 Linear 展开为二维 + reshape，规避 MatMul 维度推断不稳定
- `_patch_gemma_attention_for_npu_graph_compile()`: 替换 GemmaAttention 为 graph-safe 实现（bmm 替代 matmul）
- `_patch_siglip_attention_for_npu_graph_compile()`: 同上，针对 SigLIP
- `_patch_gemma_rotary_for_npu_graph_compile()`: 替换 RoPE 为 graph-safe 实现

编译后端选择：
- **TorchAir**（默认 NPU 后端）：通过 `torchair.get_npu_backend()` 获取，支持 `frozen_parameter` 和 `tiling_schedule_optimize`
- **npugraph_ex**：备选 NPU 后端，通过 `npugraph_ex.get_npu_backend()` 获取
- **inductor**：通用 PyTorch 后端

### 3.3 新增模块：`vision_siglip_npu.py`

这是为 NPU 推理定制的独立 SigLIP 视觉塔实现，完全替换 transformers 自带的 SigLIP：

```
PI05SiglipVisionModel
└── PI05SiglipVisionTransformer
    ├── PI05SiglipVisionEmbeddings
    │   ├── patch_embedding (Conv2d)
    │   └── position_embedding (Embedding)
    ├── PI05SiglipEncoder
    │   └── PI05SiglipEncoderLayer × N
    │       ├── LayerNorm
    │       ├── PI05SiglipAttention  ← 核心 NPU 优化
    │       │   ├── fuse_qkv_weights()  ← QKV 融合
    │       │   ├── enable_npu_pfa()     ← PFA 开关
    │       │   └── forward():
    │       │       ├── 融合 QKV 投影
    │       │       ├── NPU PFA (FP16 Q/K/V, 输出恢复原 dtype)
    │       │       └── eager attention (fallback)
    │       ├── LayerNorm
    │       └── PI05SiglipMLP
    ├── post_layernorm
    └── PI05SiglipMultiheadAttentionPoolingHead
```

关键设计：
- **PFA 使用 FP16 Q/K/V 计算**：Q/K/V 强制转为 float16 后调用 PFA，输出恢复视觉塔原始 dtype，平衡精度和性能
- **QKV 融合**：将 q_proj/k_proj/v_proj 权重合并为单一 qkv Linear
- **条件判断**：`_can_use_npu_pfa()` 检查 eval 模式、NPU 设备、半精度、torch_npu 可用
- **替换机制**：通过 `prepare_vision_tower_npu_fused_ops()` 在加载权重后将 transformers SigLIP 替换为本地实现

### 3.4 图像预处理优化

```python
# PI05Policy._preprocess_images()
# 原路径: NCHW → NHWC (permute) → resize → NHWC → NCHW (permute)
# 优化后: 保留原布局 → resize_with_pad_torch(自动识别格式) → 直接使用
# 避免 NPU 上两次 transposes 的开销
```

### 3.5 推理时延测试工具 (`pi05_latency.py`)

```
pi05_latency.py
├── 支持两种模式:
│   ├── eager NPU 融合: --graph-compile 不指定
│   └── TorchAir 双图: --graph-compile
├── 测量两个维度:
│   ├── e2e: 完整 predict_action_chunk 路径
│   └── model.sample_actions: 纯模型推理
├── 统计指标: mean / median / p90
├── 同步测量: 使用 torch.npu.synchronize()
└── 输出: 终端 + 日志文件
```

## 四、训练流程

### 4.1 训练启动

```bash
# 使用 Accelerate 多机多卡训练
accelerate launch --num_processes=16 lerobot-train \
  --dataset.repo_id=${dataset_path} \
  --policy.type=pi05 \
  --policy.dtype=bfloat16 \
  --policy.repo_id=${pi05_weights} \
  --steps=30000 --batch_size=8
```

### 4.2 NPU 训练环境变量

```bash
export TASK_QUEUE_ENABLE=2          # task queue 流水优化
export CPU_AFFINITY_CONF=2          # 细粒度绑核
export COMBINED_ENABLE=1            # combined 标志
export PYTORCH_NPU_ALLOC_CONF=expandable_segments:True  # 内存扩展
export DYNAMIC_OP="ADD#MUL"         # 动态算子融合
export MULTI_STREAM_MEMORY_REUSE=1  # 多流内存复用
```

### 4.3 数据加载优化

- `num_workers=12`（原 4）
- `persistent_workers=True`：Worker 进程常驻，避免每轮 fork 开销
- `pin_memory=True`：NPU 上固定使用 page-locked memory
- `prefetch_factor=4`（原 2）：增大预取缓冲

## 五、推理流程

### 5.1 推理路径决策树

```
sample_actions()
├── RTC 参数存在? → 走原生 eager 路径
├── 图编译已启用 && 无 RTC?
│   └── _sample_actions_graph_inference()
│       ├── 编译的 prefix 图 → KV cache
│       └── 编译的 denoise 10步图 → action
├── NPU 融合条件满足?
│   └── _forward_npu_optimized()
│       ├── QKV 融合 + PFA + NPU RoPE + NPU RMSNorm
│       └── AdaRMS 融合调制
└── fallback → 原生 eager 路径
```

### 5.2 推理优化清单

| 优化项 | 作用 |
|--------|------|
| QKV 权重融合 | 减少每个 attention 层的 Linear 调用次数 |
| NPU PFA | 替换标准 attention 为 NPU 融合算子 |
| NPU RoPE | 使用 `npu_rotary_mul` 融合算子 |
| NPU RMSNorm | 使用 `npu_rms_norm` 融合算子 |
| NPU 融合残差 | `npu_add_rms_norm` 合并残差加法和归一化 |
| AdaRMS 调制表 | 预计算 10 步调制量，跳过 denoise 中的 dense 计算 |
| 图像布局保留 | 避免 NPU 上重复 transpose |
| TorchAir 双图 | prefix 和 denoise 分别编译，KV cache 只读复用 |
| frozen_parameter | 编译时冻结参数减少图优化开销 |
| tiling_schedule_optimize | tiling 调度优化 |

## 六、软件依赖关系

```
Pi-0.5 NPU 适配
├── CANN 8.3.RC1+           ← 昇腾 AI 处理器基础软件栈
├── TorchNPU 7.2.0+         ← PyTorch NPU 后端
├── PyTorch 2.7.1           ← 基础框架
├── MindSpeed               ← 昇腾优化库（含融合 AdamW、融合算子）
├── transformers (自定义分支) ← fix/lerobot_openpi
├── LeRobot 0.5.2           ← 机器人学习框架（基线）
├── OpenPI                  ← PI 模型上游实现
├── torchair (可选)         ← TorchAir 图编译后端
└── npugraph_ex (可选)      ← 备选 NPU 图编译后端
```

## 七、性能数据

| 平台 | 精度 | iterations | global batchsize | training loss | FPS |
|------|------|-----------|-----------------|---------------|-----|
| 竞品 H | bf16 | 30k | 64 | 0.005 | 70.8 |
| Atlas 800T A3 | bf16 | 30k | 128 | 0.004 | 155.1 |
| Atlas 950 SuperPoD | bf16 | 30k | 128 | - | 165.0 |

A3 相比竞品 H 在 batchsize 翻倍的情况下 FPS 达到 2.19x，loss 也更优。

## 八、总结

Pi-0.5 NPU 适配是一个**系统性的三层架构适配工程**：

1. **训练层**：通过 MindSpeed 融合优化器、DataLoader 参数调优、ACT attention 适配实现 NPU 训练
2. **推理层**：通过 QKV 融合、NPU PFA/RoPE/RMSNorm 算子替换、AdaRMS 融合调制、固定步骤查找表实现了 eager 模式下的 NPU 深度推理优化
3. **图编译层**：通过 TorchAir prefix/denoise 双图编译、graph-safe 算子实现、Linear/Attention/RoPE patching 实现了编译模式下的极致推理性能

整个适配设计遵循"**训练保精度、推理求极致**"的原则，训练路径保持最小侵入（仅替换优化器和 DataLoader 参数），推理路径则通过算子融合、图编译、查找表等多种手段深度优化 NPU 推理性能。