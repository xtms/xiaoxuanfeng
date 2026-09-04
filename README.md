# 大模型推理与自动驾驶训练框架学习指南

深入理解主流 LLM 推理框架与端到端自动驾驶 / 具身智能训练框架的架构设计与实现原理，涵盖 vLLM、vLLM-Ascend、nano-vLLM-NPU、SGLang 四大推理框架与 KV Cache、P/D 分离、KV Pool、服务调度、Mooncake 等推理专题，以及 Voyager、DriveVLA-W0、Emu3、Pi-0.5、π0、MTR、UniAD、Cosmos-Framework 等训练框架的 **Pi-0.5 粒度**代码级逐步分析（每个关键点附真实源码 + 逐行解释 + 可点击跳转 GitHub 的文件路径）。

## 快速开始

```bash
npm install
npm run dev
```

访问首页后需登录（演示账号：`admin / admin123`），登录后按侧边栏 Tab 在「LLM 推理」与「自动驾驶」两大板块间切换。

## 项目结构

```
xiaoxuanfeng/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx                    # 应用入口
│   ├── App.tsx                     # 路由配置（37 条，含登录守卫）
│   ├── index.css                   # 全局样式（浅色主题）
│   ├── components/
│   │   ├── Layout.tsx              # 侧边栏（LLM/自动驾驶双 Tab）+ 右侧目录 + 退出登录
│   │   ├── MermaidDiagram.tsx      # Mermaid 图表渲染（支持缩放/拖拽）
│   │   ├── CodeBlock.tsx           # 代码块 / Callout / 资源表格
│   │   ├── TableOfContents.tsx     # 右侧目录自动生成
│   │   ├── ExportButton.tsx        # 页面导出（PDF/HTML/Markdown）
│   │   ├── BackToTop.tsx           # 回到顶部
│   │   ├── AuthContext.tsx         # 登录认证状态管理（localStorage）
│   │   ├── ProtectedRoute.tsx      # 路由守卫（未登录跳转 /login）
│   │   └── LoadingSpinner.tsx      # 加载指示器
│   └── pages/
│       ├── HomePage.tsx            # 首页 — 框架卡片 + 学习路径
│       ├── OverviewPage.tsx        # 总体架构 — 总览对比 + 模块分析
│       ├── VLLMPage.tsx            # vLLM — PagedAttention + 核心模块
│       ├── VLLMArchPage.tsx        # vLLM Arch — V1 架构详解
│       ├── VLLMQuickStartPage.tsx  # vLLM 快速入门
│       ├── VLLMAscendPage.tsx      # vLLM-Ascend — 昇腾 NPU 硬件插件
│       ├── NanoVLLMPage.tsx        # nano-vLLM-NPU — 精简教育推理引擎
│       ├── SGLangPage.tsx          # SGLang — RadixAttention + 零开销调度
│       ├── ComparisonPage.tsx      # 框架对比 — 多维度横向对比
│       ├── AttentionCloseReadingPage.tsx  # Attention 机制精读
│       ├── AttentionENPage.tsx     # Attention 论文 (EN)
│       ├── InfraTechPage.tsx       # InfraTech — 推理基础设施
│       ├── KVCachePage.tsx         # KV Cache — 原理 + 管理方案
│       ├── SGLangKVCachePage.tsx   # SGLang KV Cache 机制
│       ├── VLLMKVCachePage.tsx     # vLLM KV Cache 机制
│       ├── KVCacheComparePage.tsx  # SGLang vs vLLM KV Cache 对比
│       ├── KVPoolPage.tsx          # KV Pool 概览
│       ├── MemCachePage.tsx        # Ascend MemCache
│       ├── MooncakeKVPoolPage.tsx  # Mooncake KVPool (HIXL)
│       ├── MooncakePage.tsx        # Mooncake 总览
│       ├── PDSeparationPage.tsx    # P/D 分离
│       ├── ServingSchedulerPage.tsx # 服务调度
│       ├── RouterPage.tsx          # AIBrix 服务调度器
│       ├── AutoDriveHomePage.tsx   # 自动驾驶首页 — 8 大训练框架卡片 + 学习路径
│       ├── AutoDriveOverviewPage.tsx # 自动驾驶总体架构
│       ├── VoyagerPage.tsx         # Voyager — NVIDIA 端到端自动驾驶框架
│       ├── DriveVLAW0Page.tsx      # DriveVLA-W0 — 华为 VLA 端到端大模型
│       ├── Emu3Page.tsx            # Emu3 — 智源多模态大一统模型
│       ├── Pi05Page.tsx            # Pi-0.5 — PI 通用机器人基础模型
│       ├── Pi0Page.tsx             # π0 — PI 旗舰机器人基础模型
│       ├── MTRPage.tsx             # MTR — Waymo 多模态轨迹预测
│       ├── UniADPage.tsx           # UniAD — OpenDriveLab 端到端驾驶（CVPR 2023）
│       ├── CosmosFrameworkPage.tsx # Cosmos-Framework — NVIDIA 世界模型训练基础设施
│       ├── InferFlux3DPage.tsx     # 3D 可视化容器页（MiMo-V2.5 模型结构）
│       ├── VisualizerPage.tsx      # 交互式可视化容器页（Transformer/业务流程）
│       └── LoginPage.tsx           # 登录页（独立布局，无需登录）
```

## 侧边栏结构

侧边栏顶部 Tab 切换两大板块：

```
┌─ LLM 推理 ──────────────────────────────┐
首页
总体架构
vLLM
├── vLLM
├── vLLM Arch
└── vLLM 快速入门
vLLM-Ascend
nano-vLLM-NPU
SGLang
框架对比
框架专题
├── KV Cache
│   ├── 概览
│   ├── SGLang KV Cache 机制
│   ├── vLLM KV Cache 机制
│   └── SGLang vs vLLM 对比
├── KV Pool
│   ├── 概览
│   ├── Mooncake KVPool
│   └── Ascend MemCache
├── P/D 分离
├── 服务调度
├── AIBrix
└── Mooncake
    ├── 概览
    └── KVPool (HIXL)
Attention (精读)
Attention (论文-EN)
InfraTech
模型可视化
├── LLM 业务处理视图
├── GPT 架构 3D 透视 (external)
├── MiMo-V2.5 模型结构 3D
├── Transformer Explainer (GPT-2)
├── Transformer + Speculative 3D (external)
├── PD 分离模拟器 (external)
└── vLLM P/D 分离模拟器 (external)
└────────────────────────────────────────┘

┌─ 自动驾驶 ──────────────────────────────┐
首页
总体架构
训练框架
├── Voyager
├── DriveVLA-W0
├── Emu3
├── Pi-0.5
├── π0
├── MTR
├── UniAD
└── Cosmos-Framework
└────────────────────────────────────────┘
```

## 内容覆盖

### 推理框架分析

| 页面 | 说明 |
|------|------|
| **首页** | 四大框架概览卡片、结构化学习路径 |
| **总体架构** | 通用推理架构图、框架总览对比表、请求生命周期、核心模块对比 |
| **vLLM** | PagedAttention 原理、多进程架构、5 大核心模块（Engine/Scheduler/BlockManager/Worker/ModelRunner）、类图 |
| **vLLM Arch** | V1 架构详解、Engine Core 设计 |
| **vLLM 快速入门** | 安装、配置、启动、API 调用 |
| **vLLM-Ascend** | 硬件可插拔插件架构、CANN 软件栈、与 CUDA vLLM 的关键差异 |
| **nano-vLLM-NPU** | 精简架构（~2,428 行）、Qwen3-0.6B 模型结构、三种 Attention 实现、NPU 优化技术 |
| **SGLang** | RadixAttention 前缀树、零开销 CPU 调度器、Prefill-Decode 分离架构 |
| **框架对比** | 10 维度综合对比表、KV Cache 管理对比、调度策略对比、硬件抽象对比、适用场景推荐 |

### 推理框架专题

| 页面 | 说明 |
|------|------|
| **KV Cache 概览** | KV Cache 数学原理、4 种管理方案（重计算/共享前缀/压缩/溢出）、PagedAttention、RadixAttention、GQA/MQA、量化 |
| **SGLang KV Cache 机制** | RadixAttention 树、缓存命中策略、Memory Pool 管理 |
| **vLLM KV Cache 机制** | PagedAttention 分页、BlockManager、前缀缓存 (APC) |
| **SGLang vs vLLM 对比** | 两大框架 KV Cache 管理机制逐项对比 |
| **KV Pool 概览** | 内存共享机制（GlobalPageTable + 引用计数）、分层存储 HBM→DRAM→SSD、P/D 分离交互、业界方案对比 |
| **Mooncake KVPool** | HIXL Engine 详解、UB 协议、LLM-DataDist V2、多链路拓扑、FabricMem、vllm-ascend 部署 |
| **Ascend MemCache** | MetaService + LocalService 架构、MemFabric OneCopy、7 种硬件路径、KV Block API、vllm-ascend 集成 |
| **P/D 分离** | Prefill/Decode 解耦原理、KV Cache 传输（NCCL/RDMA/Mooncake）、调度策略、vLLM/SGLang/Mooncake 实现对比 |
| **服务调度** | Continuous Batching、Chunked Prefill、抢占策略、前缀感知调度、公平性调度 |
| **AIBrix** | sgl-router（缓存感知路由）、LiteLLM、Triton、TGI Router、Nginx/Envoy 代理 |
| **Mooncake 概览** | KVCache-Centric 架构、Master Server + Transfer Engine 核心组件、请求生命周期、P/D 分离核心作用（拓扑感知配对、多轮对话优化、故障恢复）、Layer-wise Pipeline、去重传输、两种传输引擎对比（Transfer Engine vs HIXL Engine） |

### 训练框架分析（Pi-0.5 粒度 · 代码级）

| 页面 | 说明 |
|------|------|
| **自动驾驶首页** | 8 大训练框架卡片（Voyager / DriveVLA-W0 / Emu3 / Pi-0.5 / π0 / MTR / UniAD / Cosmos-Framework）+ 学习路径 |
| **总体架构** | 端到端自动驾驶核心范式：模仿学习、强化学习、VLA 架构 |
| **Voyager** | NVIDIA 端到端自动驾驶训练框架，世界模型 + 规划器 |
| **DriveVLA-W0** | 华为 VLA 端到端大模型：train_moe.py / train_pi0.py 入口、Flow-Matching 目标、ZeRO-3、关键配置速查 |
| **Emu3** | 智源多模态大一统模型：训练入口、VQ tokenizer、next-token 预测、tiktoken |
| **Pi-0.5** | PI 通用机器人基础模型，18 处文件引用可点击跳转 GitHub（lerobot / openpi / NPU 新增文件自动路由） |
| **π0** | PI 旗舰机器人基础模型，跨具身泛化 |
| **MTR** | Waymo 多模态轨迹预测：train.py → train_utils.py → MotionTransformer → mtr_encoder（mask-cat 30 维 / knn_batch_mlogk K=16）→ mtr_decoder（6 层深度监督 / intention points）→ nll_loss_gmm_direct（log_std clip）→ waymo 29 维特征 → collate_batch |
| **UniAD** | 端到端自动驾驶六任务统一（CVPR 2023 最佳论文）：uniad_dist_train.sh → mmdet Runner → uniad_e2e → uniad_track（901 query / QIM / MemoryBank）→ motion_head（query 级联 / cumsum）→ planning_head（detach）→ 两阶段课程训练对比，13 个 GitHub SrcLink |
| **Cosmos-Framework** | NVIDIA 世界模型训练/微调基础设施：`--sft-toml` 唯一入口 + `--deterministic` 双阶段 → 三层配置流（TOML→pydantic extra="forbid"→Hydra override→LazyConfig）→ PATH_REMAPS 最长前缀重映射 → ImaginaireTrainer（megatron parallel_state）→ train() 循环（grad_accum 闸门）→ training_step（ddp_sync_grad + GradScaler）→ ContextParallelDataWindow（CP 数据窗口 / all_reduce stop 信号）→ DistillationTrainer（closures + PhaseOptimizer）→ GradClip 按 mesh 分组 → LoRA-only SFT 配方，14 个 GitHub SrcLink |

### 模型可视化

| 页面 | 说明 |
|------|------|
| **LLM 业务处理视图** | 3 个 3D 交互场景：推理请求全流程、Transformer 内部处理、P/D 分离业务处理（数据流 / KV 块 / token 现场动态模拟） |
| **MiMo-V2.5 模型结构 3D** | 310B omni-modal MoE 模型结构的 3D 交互可视化，可切 Tensor/Data/Expert 并行与 P/D 部署 |
| **Transformer Explainer (GPT-2)** | 参照 poloclub/transformer-explainer 构建的 GPT-2 内部机制交互式可视化（5 组真实 distilgpt2 激活数据，Attention 三阶段矩阵展开，温度/top-k/top-p 实时重采样） |

### 其他

| 页面 | 说明 |
|------|------|
| **Attention (精读)** | Transformer Attention 机制深入解析 |
| **Attention (论文-EN)** | "Attention Is All You Need" 论文精读 |
| **InfraTech** | 推理基础设施技术栈 |

## 各框架核心模块覆盖

### 推理框架

| 模块 | vLLM | vLLM-Ascend | nano-vLLM | SGLang |
|------|------|-------------|-----------|--------|
| 调度器 (Scheduler) | ✅ | ✅ (继承) | ✅ (FCFS/SJF/优先级) | ✅ (零开销) |
| KV Cache 管理 | ✅ PagedAttention | ✅ (继承) | ✅ PagedAttention | ✅ RadixAttention |
| 内存管理 (BlockManager) | ✅ | ✅ | ✅ | — |
| 模型执行 (ModelRunner) | ✅ | ✅ | ✅ | — |
| 硬件抽象 | ✅ (内置) | ✅ (插件) | ✅ (直接集成) | ✅ (统一抽象) |
| 并行策略 | ✅ TP/PP/DP/EP/CP | ✅ TP/EP | ✅ TP | ✅ TP/PP/DP/EP/SP |
| 前缀缓存 | ✅ APC | ✅ (继承) | ✅ | ✅ Radix Tree |
| 图编译 | ✅ CUDA Graph | ✅ | ✅ torchair | ✅ |

### 训练框架

| 维度 | MTR | DriveVLA-W0 | Emu3 | Pi-0.5 | UniAD | Cosmos-Framework |
|------|-----|-------------|------|--------|-------|------------------|
| 任务 | 轨迹预测 | VLA 端到端驾驶 | 多模态生成 | VLA 机器人 | 端到端驾驶 | 世界模型训练基础设施 |
| 代码级分析 | ✅ 10 节 | ✅ 训练入口/Flow-Matching/ZeRO-3 | ✅ 入口/VQ/next-token | ✅ 18 处 GitHub 链接 | ✅ 11 节 | ✅ 12 节 |
| GitHub 源码链接 | ✅ 8+ | ✅ 13+ | ✅ 12+ | ✅ 18 | ✅ 13+ | ✅ 14+ |

## 页面路由

### LLM 推理

| 路由 | 页面 |
|------|------|
| `/` | 首页 |
| `/overview` | 总体架构 |
| `/vllm` | vLLM |
| `/vllm-arch` | vLLM Arch |
| `/vllm-quickstart` | vLLM 快速入门 |
| `/vllm-ascend` | vLLM-Ascend |
| `/nano-vllm` | nano-vLLM-NPU |
| `/sglang` | SGLang |
| `/comparison` | 框架对比 |
| `/kv-cache` | KV Cache 概览 |
| `/sglang-kv-cache` | SGLang KV Cache 机制 |
| `/vllm-kv-cache` | vLLM KV Cache 机制 |
| `/kv-cache-compare` | SGLang vs vLLM 对比 |
| `/kv-pool` | KV Pool 概览 |
| `/mooncake-kvpool` | Mooncake KVPool |
| `/memcache` | Ascend MemCache |
| `/pd-separation` | P/D 分离 |
| `/serving-scheduler` | 服务调度 |
| `/router` | AIBrix |
| `/mooncake` | Mooncake 概览 |
| `/attention-close-reading` | Attention (精读) |
| `/attention-en` | Attention (论文-EN) |
| `/infratech` | InfraTech |

### 自动驾驶

| 路由 | 页面 |
|------|------|
| `/auto-drive` | 自动驾驶首页 |
| `/auto-drive/overview` | 总体架构 |
| `/auto-drive/voyager` | Voyager |
| `/auto-drive/drivevla-w0` | DriveVLA-W0 |
| `/auto-drive/emu3` | Emu3 |
| `/auto-drive/pi-0-5` | Pi-0.5 |
| `/auto-drive/pi0` | π0 |
| `/auto-drive/mtr` | MTR |
| `/auto-drive/uniad` | UniAD |
| `/auto-drive/cosmos-framework` | Cosmos-Framework |

### 可视化 & 其他

| 路由 | 页面 |
|------|------|
| `/model-structure-3d` | MiMo-V2.5 模型结构 3D |
| `/transformer-explainer` | Transformer Explainer (GPT-2) |
| `/business-process` | LLM 业务处理视图 |
| `/login` | 登录页（无需登录） |

## 包含的图表类型

### 架构图 (Flowchart)

- 通用 LLM 推理分层架构图
- vLLM V1 多进程架构图（API Server / Engine Core / GPU Worker / DP Coordinator）
- vLLM-Ascend 硬件可插拔架构图
- nano-vLLM-NPU 精简架构图
- SGLang 整体架构图
- Mooncake KVCache-Centric 架构图
- Mooncake 两种传输引擎架构图
- HIXL + Mooncake 分层架构图
- LLM-DataDist V2 架构图
- Ascend MemCache 架构图
- KV Pool 分层存储架构图
- MemFabric OneCopy 数据流图
- FabricMem 超节点全局内存池图
- **MTR 训练流程 / 编码器-解码器架构图**
- **UniAD 六任务端到端架构图**
- **Cosmos-Framework 仓库整体布局 / 三层配置系统图**

### 时序图 (Sequence Diagram)

- 通用请求处理生命周期
- vLLM 请求处理时序图
- vLLM-Ascend 请求处理时序图
- SGLang RadixAttention 请求处理时序图
- Mooncake P/D 分离全流程时序图（4 阶段）
- Mooncake 多轮对话 P/D 优化时序图
- HIXL 单边通信 vs 传统双边通信对比图
- Transfer Engine GPU Direct RDMA 数据流图
- HIXL Engine 单边零拷贝数据流图
- P/D 分离 KV Cache 传输时序图
- **Cosmos-Framework 端到端训练流程时序图（TOML → 配置 → Trainer → 数据窗口 → 分布式训练）**

### 类图 (Class Diagram)

- vLLM 核心类关系图（LLMEngine → Scheduler / BlockManager → Worker → ModelRunner）

### 甘特图 (Gantt)

- Mooncake Layer-wise Pipeline 甘特图

### 数据流图

- PagedAttention 逻辑序列到物理块映射图
- RadixAttention Radix Tree 前缀共享示例图
- Prefill-Decode 分离架构图

## 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite 8
- **样式方案**: Tailwind CSS 4
- **图表渲染**: Mermaid.js（支持缩放/拖拽）
- **路由**: React Router 7
- **认证**: AuthContext + ProtectedRoute 路由守卫（localStorage 持久化）

## 构建部署

```bash
# 生产构建
npm run build

# 预览构建产物
npm run preview
```

构建产物输出到 `dist/` 目录，可直接部署到任意静态文件服务器（Nginx / CDN 等）。

## 外部资源

### 推理框架

| 资源 | 链接 |
|------|------|
| vLLM GitHub | https://github.com/vllm-project/vllm |
| vLLM 官方文档 | https://docs.vllm.ai |
| vLLM-Ascend GitHub | https://github.com/vllm-project/vllm-ascend |
| nano-vLLM-NPU | https://github.com/xtms/nano-vllm-npu |
| SGLang GitHub | https://github.com/sgl-project/sglang |
| SGLang 官方文档 | https://docs.sglang.io |

### Mooncake & KV Pool

| 资源 | 链接 |
|------|------|
| Mooncake 论文 | https://arxiv.org/abs/2407.00079 |
| Mooncake 源码 | https://github.com/kvcache-ai/Mooncake |
| HIXL (Ascend 适配) | https://gitcode.com/cann/hixl |
| Mooncake KVPool 指南 | https://gitcode.com/cann/hixl/wiki/Mooncake-KVPool%E6%8C%87%E5%8D%97 |
| Ascend MemCache | https://gitcode.com/Ascend/memcache |

### 训练框架源码

| 资源 | 链接 |
|------|------|
| Voyager (NVIDIA) | https://github.com/NVIDIA/Voyager |
| DriveVLA-W0 (华为) | https://github.com/BraveGroup/DriveVLA-W0 |
| Emu3 (智源) | https://github.com/baaivision/Emu3 |
| Pi-0.5 (lerobot) | https://github.com/huggingface/lerobot |
| Pi-0.5 (openpi) | https://github.com/physical-intelligence/openpi |
| π0 (openpi) | https://github.com/physical-intelligence/openpi |
| MTR (Waymo) | https://github.com/sshaoshuai/MTR |
| UniAD (OpenDriveLab) | https://github.com/OpenDriveLab/UniAD |
| Cosmos-Framework (NVIDIA) | https://github.com/NVIDIA/cosmos-framework |

### 论文

| 资源 | 链接 |
|------|------|
| PagedAttention (SOSP 2023) | https://arxiv.org/abs/2309.06180 |
| "Attention Is All You Need" | https://arxiv.org/abs/1706.03762 |
| Splitwise (P/D 分离) | https://arxiv.org/abs/2311.18677 |
| DistServe | https://arxiv.org/abs/2401.09670 |

### 学习资源

| 资源 | 链接 |
|------|------|
| The Illustrated Transformer | https://jalammar.github.io/illustrated-transformer/ |
| The Annotated Transformer | https://nlp.seas.harvard.edu/2018/04/03/attention.html |
| Attention? Attention! | https://lilianweng.github.io/posts/2018-06-24-attention/ |
| The Transformer Family v2.0 | https://lilianweng.github.io/posts/2023-01-27-the-transformer-family-v2/ |
| minGPT | https://github.com/karpathy/minGPT |
| nanoGPT | https://github.com/karpathy/nanoGPT |
| HuggingFace Transformers | https://github.com/huggingface/transformers |
| vLLM 技术博客 | https://blog.vllm.ai/2023/06/20/vllm.html |
| 昇腾社区 | https://www.hiascend.com |
