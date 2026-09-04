# 2026-08-31 工作总结

## 新增页面

### Mooncake 概览页 (`/mooncake`)
- 创建 `src/pages/MooncakePage.tsx`，全面覆盖 Mooncake 架构
- 7 大章节：核心设计理念 → 核心组件 → 请求生命周期 → P/D 分离调度 → KV Cache 传输优化 → 两种传输引擎 → 与 vLLM 对比

## P/D 分离场景深化

在 Mooncake 概览页新增 4 个子章节，详细描述 Mooncake 在 P/D 分离中的作用：

1. **核心作用** — 三大问题（传输/节点选择/前缀共享）的 Mooncake 解决方案
2. **全流程详解** — 4 阶段时序图（请求接入 → Prefill → KV 传输 → Decode）
3. **拓扑感知配对** — 含算法代码，综合网络距离 + 传输量 + 负载选择最优节点
4. **多轮对话优化** — 时序图 + 数据对比（节省 59% Prefill 计算量）
5. **故障恢复** — 三类故障（Prefill/Decode/Transfer Engine）的恢复策略 + 代码

## 两种传输引擎专题

替换原"多平台支持"简表，新增详细对比：

### Transfer Engine（NVIDIA）
- GPU Direct RDMA 原理（GPU HBM → NIC → GPU HBM，0 次 CPU 拷贝）
- 传输协议选择（NVLink 900 GB/s / RDMA 400 GB/s / TCP 100 GbE）
- P/D 数据传输时序图 + 完整代码实现

### HIXL Engine（Ascend）
- 单边零拷贝通信模型（远端 CPU 零参与）
- 单边 vs 双边通信对比表
- 多协议（HCCS 119 GB/s / RDMA 22 GB/s / UB）
- P/D 数据传输时序图 + 完整代码实现

### 对比
- 18 维度全面对比表
- 6 种场景选型建议
- 关键差异总结

## 侧边栏更新

`框架专题` 下新增 Mooncake 组：
```
框架专题
└── Mooncake
    ├── 概览 (/mooncake)
    └── KVPool (HIXL) (/mooncake-kvpool)
```

## README.md 更新

全面更新以反映项目实际状态：
- 项目结构：7 个页面 → 20 个页面 + 6 个组件
- 侧边栏结构完整展示
- 内容覆盖分三大类：框架分析（9 页）、框架专题（8 页）、其他（3 页）
- 20 条路由完整列出
- 新增 Mooncake/KV Pool 相关图表约 15 个
- 外部资源新增 Mooncake/KV Pool 区和论文区

## 当前项目规模

| 指标 | 数值 |
|------|------|
| 总页面数 | 20 |
| 路由数 | 20 |
| 侧边栏层级 | 4 级嵌套（首页 → 框架专题 → Mooncake → 概览） |
| 核心组件 | 6 个（Layout, MermaidDiagram, CodeBlock, TableOfContents, ExportButton, BackToTop） |

---

# 2026-09-04 工作总结

## 自动驾驶 → 训练框架板块（深度分析）

在「自动驾驶」板块下对主流训练框架做 **Pi-0.5 粒度**的代码级逐步分析，每个关键点附真实源码 + 逐行解释 + 文件路径，并可点击跳转 GitHub 源码。

### 新增 / 重写页面

1. **MTR** (`/auto-drive/mtr`) — 重写为代码级分析（GitHub: sshaoshuai/MTR@master）
   - 10 个小节：train.py → train_utils.py → MotionTransformer → mtr_encoder（mask-cat 30 维技巧 / knn_batch_mlogk K=16）→ mtr_decoder（6 层深度监督 / intention points）→ nll_loss_gmm_direct（log_std clip [-1.609,5.0]）→ waymo 29 维特征 → collate_batch

2. **DriveVLA-W0** (`/auto-drive/drivevla-w0`) — 重写为代码级分析（GitHub: BraveGroup/DriveVLA-W0@main）
   - 训练入口 train_moe.py / train_pi0.py、Flow-Matching、ZeRO-3、关键配置速查

3. **Emu3** (`/auto-drive/emu3`) — 重写为代码级分析（GitHub: baaivision/Emu3@main）
   - 训练入口、VQ tokenizer、next-token 预测、tiktoken

4. **UniAD** (`/auto-drive/uniad`) — 新增页面（GitHub: OpenDriveLab/UniAD@v2.0 分支）
   - 11 个小节：uniad_dist_train.sh → mmdet Runner → uniad_e2e（六任务串联）→ uniad_track（901 query / QIM / MemoryBank）→ motion_head（query 级联 / cumsum trick）→ planning_head（detach 不回传）→ traj/planning loss → 两阶段课程训练对比表
   - 13 个 GitHub SrcLink

5. **Cosmos-Framework** (`/auto-drive/cosmos-framework`) — 新增页面（GitHub: NVIDIA/cosmos-framework@main, v1.2.2）
   - 12 个小节：scripts/train.py（--sft-toml 唯一入口 + --deterministic 双阶段）→ 三层配置流（TOML→pydantic extra="forbid"→Hydra override→LazyConfig）→ PATH_REMAPS 最长前缀重映射 → ImaginaireTrainer 构造（megatron parallel_state）→ train() 训练循环（grad_accum 闸门）→ training_step（ddp_sync_grad + GradScaler）→ ContextParallelDataWindow（CP 数据窗口 / all_reduce stop 信号）→ DistillationTrainer（closures + PhaseOptimizer）→ ImaginaireModel 基类 → GradClip 按 mesh 分组 → vision_sft_super.toml 速查 → 旧版 _train.py 对比
   - 14 个 GitHub SrcLink

6. **Pi-0.5** (`/auto-drive/pi-0-5`) — 「文件:」引用全部改为可点击 GitHub 链接
   - 18 处文件引用自动路由：`src/lerobot/*` → huggingface/lerobot、`src/openpi/*` + train_pytorch.py → physical-intelligence/openpi、modeling_pi05.py → 补全为 lerobot pi05 路径、NPU 新增文件（vision_siglip_npu.py / pi05_latency.py）→ 链接 pi05 目录

### 注册改动

- `src/App.tsx`：新增 `/auto-drive/uniad`、`/auto-drive/cosmos-framework` 路由
- `src/components/Layout.tsx`：训练框架侧边栏新增 UniAD、Cosmos-Framework
- `src/pages/AutoDriveHomePage.tsx`：框架卡片 + 统计 7→8 + 学习路径 step 7/8

### 验证

- 每个页面：`npx tsc --noEmit` → `npx vite build` → Playwright 冒烟（smoke-training-frameworks.cjs，含 ghBase/ghMin 检查）
- 全部 SMOKE PASS

### JSX 模板字符串陷阱（重要，写页面时注意）

- JSX 文本中的字面量 `{...}` 会被解析为 JSX 表达式 → 必须用 `{'...'}` 包裹（如 `{'logs/train.{月日时分}.log'}`、`{'${...}'}`）
- 模板字面量中的反引号 → `\`` 转义；`${...}` → `\${...}`；行末单个 `\` → `\\`；`\p`/`\r` 等 → `\\p`
- tsc 不捕获 JSX 花括号/模板问题，**vite build + 运行时冒烟才是真正判官**