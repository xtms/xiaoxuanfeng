# 大模型推理与自动驾驶训练框架学习指南

深入理解主流 LLM 推理框架与端到端自动驾驶 / 具身智能训练框架的架构设计与实现原理，涵盖 vLLM、vLLM-Ascend、nano-vLLM-NPU、SGLang 四大推理框架与 KV Cache、P/D 分离、KV Pool、服务调度、Mooncake 等推理专题，以及 **DeepInfer 剖面 + mini-DeepInfer 教学引擎**（14 课从一条请求读懂 DeepInfer 源码）、Voyager、DriveVLA-W0、Emu3、Pi-0.5、π0、MTR、UniAD、Cosmos-Framework 等训练框架的 **Pi-0.5 粒度**代码级逐步分析（每个关键点附真实源码 + 逐行解释 + 可点击跳转 GitHub 的文件路径）。

## 快速开始

```bash
npm install
npm run dev
```

访问首页后按侧边栏 Tab 在「LLM 推理」「DeepInfer」「自动驾驶」三大板块间切换（无需登录）。

## 项目结构

```
xiaoxuanfeng/
├── index.html
├── package.json
├── vite.config.ts
├── public/
│   ├── inferflux/                 # 3D / 交互可视化静态页（模型结构、Transformer、P/D 模拟器等）
│   └── deepinfer-explained/       # DeepInfer 剖面静态站（8 个 HTML 教学页，无构建依赖）
├── src/
│   ├── main.tsx                   # 应用入口
│   ├── App.tsx                    # 路由配置（60+ 条，无登录守卫，/login 重定向首页）
│   ├── index.css                  # 全局样式（浅色主题）
│   ├── components/
│   │   ├── Layout.tsx             # 侧边栏（LLM/DeepInfer/自动驾驶 三 Tab）+ 右侧目录
│   │   ├── Sidebar.tsx            # 侧边栏渲染 + Tab 切换按钮 + 搜索过滤
│   │   ├── sidebarData.ts         # 侧边栏菜单数据（纯数据模块）+ 路径/搜索工具
│   │   ├── MermaidDiagram.tsx     # Mermaid 图表渲染（支持缩放/拖拽）
│   │   ├── CodeBlock.tsx          # 代码块 / Callout / 外部链接 / 资源表格
│   │   ├── TableOfContents.tsx    # 右侧目录自动生成
│   │   ├── ExportButton.tsx       # 页面导出（PDF/HTML/Markdown）
│   │   ├── BackToTop.tsx          # 回到顶部
│   │   ├── PageHeader.tsx         # 页面头部（标题 / 日期 / 阅读时长 / 标签）
│   │   └── LoadingSpinner.tsx     # 加载指示器
│   └── pages/
│       ├── HomePage.tsx           # 首页 — 框架卡片 + 学习路径
│       ├── OverviewPage.tsx       # 总体架构 — 总览对比 + 模块分析
│       ├── VLLMPage.tsx           # vLLM — PagedAttention + 核心模块
│       ├── VLLMArchPage.tsx       # vLLM Arch — V1 架构详解
│       ├── VLLMQuickStartPage.tsx # vLLM 快速入门
│       ├── VLLMAscendPage.tsx     # vLLM-Ascend — 昇腾 NPU 硬件插件
│       ├── NanoVLLMPage.tsx       # nano-vLLM-NPU — 精简教育推理引擎
│       ├── SGLangPage.tsx         # SGLang — RadixAttention + 零开销调度
│       ├── ComparisonPage.tsx     # 框架对比 — 多维度横向对比
│       ├── AttentionCloseReadingPage.tsx  # Attention 机制精读
│       ├── AttentionENPage.tsx     # Attention 论文 (EN)
│       ├── InfraTechPage.tsx       # InfraTech — 推理基础设施
│       ├── LLMLearningPage.tsx     # 推理框架学习资料 — GitHub 仓库 / 论文分类索引
│       ├── Nanovllm2DeepinferPage.tsx # nano-vLLM → DeepInfer — 34 节增量改写学习路线
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
│       ├── VllmSchedulerPage.tsx    # vLLM 调度模块（V1 Scheduler）
│       ├── SGLangSchedulerPage.tsx  # SGLang 调度模块（Radix Cache 调度器）
│       ├── RouterPage.tsx          # AIBrix 服务调度器
│       ├── SGLangGatewayPage.tsx   # SGLang Model Gateway — 纯 Rust 调度网关
│       ├── VllmRouterPage.tsx      # vLLM Router — vLLM 版调度网关（fork）
│       ├── DeepInferExplainedPage.tsx # DeepInfer 剖面 — iframe 嵌入 8 个静态教学页
│       ├── DeepInferMiniPage.tsx   # mini-DeepInfer — 教学引擎整合页（十四课入口）
│       ├── DeepInferLesson1..14Page.tsx # mini-DeepInfer 十四课（每课一个源码级页面）
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
│       ├── VisualizerPage.tsx      # 交互式可视化容器页（Transformer / 业务流程 / 架构对比）
│       └── LoginPage.tsx           # （已移除 — /login 重定向首页）
```

## 侧边栏结构

侧边栏顶部 Tab 切换三大板块（路径会自动跟随，直接输入 URL 也会切到对应板块）：

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
KV Cache
├── 概览
├── SGLang KV Cache 机制
├── vLLM KV Cache 机制
└── SGLang vs vLLM 对比
KV Pool
├── 概览
├── Mooncake KVPool
└── Ascend MemCache
P/D 分离
服务调度
├── 概览
├── vLLM 调度
└── SGLang 调度
调度器
├── AIBrix
├── SGLang Model Gateway
└── vLLM Router
Mooncake
Attention (精读)
Attention (论文-EN)
InfraTech
推理框架学习资料
nano-vLLM → DeepInfer
模型可视化
├── LLM 业务处理视图
├── GPT 架构 3D 透视 (external)
├── MiMo-V2.5 模型结构 3D
├── Qwen3.8 vs DeepSeek V4 架构 3D
├── Transformer Explainer (GPT-2)
├── Transformer + Speculative 3D (external)
├── PD 分离模拟器 (external)
└── vLLM P/D 分离模拟器 (external)
└────────────────────────────────────────┘

┌─ DeepInfer ─────────────────────────────┐
DeepInfer 剖面
├── 总览（整机剖面）
├── 请求与调度
├── 运行时与异步
├── 模型与注意力
├── 采样与结构
├── 测量与效率
├── 生产恢复
└── 整机图谱
mini-DeepInfer 教学引擎
└── 十四课学习路径
    ├── 一 跟踪一个请求
    ├── 二 真实权重与 KV Cache
    ├── 三 同步批处理
    ├── 四 Qwen3.5 的两种缓存
    ├── 五 缓存为什么还不能还
    ├── 六 NPU 算完 CPU 就能读吗
    ├── 七 结果回来后，再提交进度
    ├── 八 BatchEngine 分步执行
    ├── 九 等待期间准备新文本
    ├── 十 先准备采样索引
    ├── 十一 下一轮先发出去
    ├── 十二 请求结束，下一轮已发出
    ├── 十三 新请求放进哪一轮
    └── 十四 发出去了，不等于已提交
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
| **推理框架学习资料** | 分门别类整理 GitHub 权威仓库与必读论文（官方框架 / 源码笔记 / KV Cache 调度 / Kernel 加速库 / 量化压缩 / DeepSeek 推理生态 / 前沿论文），链接经 GitHub API 核实 |
| **nano-vLLM → DeepInfer** | 从 nano-vllm（1.4k 行 Python）一个 PR 一个 PR 改写成 DeepInfer 的学习路线：34 节增量 PR（复现瓶颈 → 追问本质 → 对照 DeepInfer 实现 → 同一实验验收），覆盖引擎控制面、解码加速、KV 与显存、DeepSeek-V4.1-Flash 各组件、分布式并行 |

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
| **服务调度** | vLLM 与 SGLang 调度模块对照分析（概览层）：六大共同点（迭代级 Continuous Batching / Token Budget + Chunked Prefill / 前缀缓存深度集成 / 抢占 + 缓存恢复 / 优先级调度 / 调度与执行重叠）+ 七大差异点（进程模型 / Block Hash vs Radix Tree / 2 种 vs 6 种策略 / 抢占机制 / 固定 vs 动态 Token 预算 / prefill-decode 共存 / 可观测与路由联动）+ 综合对比表 + 选型建议，26 处 SrcLink（vLLM + SGLang 双源） |
| **vLLM 调度** | vLLM V1 Scheduler：单轮 schedule() 三步主循环、双等待队列、Token Budget 切片式 Chunked Prefill、regenerate 式抢占、前缀缓存三层架构（KVCacheManager→Coordinator→BlockPool）、FCFS/PRIORITY 策略、AsyncScheduler placeholder 流水线化调度，Pi-0.5 粒度 + 26 处 SrcLink |
| **SGLang 调度** | SGLang Scheduler：单线程 polling 事件循环 + GPU/CPU overlap、get_next_batch_to_run 决策、PrefillAdder token 预算管家、Radix Cache 前缀树（lock_ref 保护 / LRU-LFU 驱逐）、cache-aware 策略（LPM/DFS-Weight/ROUTING_KEY）、retract_decode 抢占、mixed chunk 混合前向、scheduler_components 20+ 子组件，Pi-0.5 粒度 + 28 处 SrcLink |
| **AIBrix** | K8s 控制平面 + Envoy 数据面、多策略加权路由、PodAutoscaler、ModelRouter、KV Cache 管理、P/D 分离路由、StormService |
| **SGLang Model Gateway** | 纯 Rust 调度网关（63K 行）、控制面+数据面、7 种负载均衡策略、Radix 前缀树、PD 路由器、gRPC 管线、OpenAI 路由 + MCP、可靠性/可观测性，与 AIBrix 合并对比 |
| **vLLM Router** | vLLM 版调度网关（36K 行 Rust，SGLang Model Gateway 官方 fork）：fork 差异总览、双入口（Rust bin + PyO3）、6 种负载均衡策略（含新增 rendezvous_hash）、vLLM 两阶段 P/D 路由（NIXL/Mooncake/MoRI-IO 三种 KV Connector + logprobs 合并 + 响应存储）、ZMQ + K8s 双通道服务发现、OpenAI 后端代理、IGW 多路由器、OTel 可观测性、多后端 tokenizer，与母体/AIBrix 三方对比 |
| **Mooncake 概览** | KVCache-Centric 分离式推理，概览（六句话速懂 + 双路径部署池化 vs 非池化 + 关键指标）+ 三面分离（元数据面/存储面/传输面）：缓存池化（Segment 挂载 + CacheLib/Offset 双分配器 + RANDOM/FREE_RATIO_FIRST/CXL 分配策略 + Ranked 采样 kCandidateMultiplier=6 + 两阶段 Put/Get + 读租约）、缓存管理（0.90 水位触发 EvictionThreadFunc + BatchEvict 并行普查按租约截止排序 + 软钉 30min/硬钉保护 + 组驱逐 + offload/promotion 换出换入）、P/D 分离数据同步（vllm_v1_proxy 两阶段代理 kv_transfer_params 邮包 + MooncakeConnector TE 直传 + MooncakeStoreConnector XpYd 池化 + PG credit-ack 数据面）、**非池化场景专题（§4.6：控制面 pull + 数据面 push，KV Cache 存取全流程——业务流程图 + 全流程时序图 + register_kv_caches/batch_register_memory 注册 → ZMQ MooncakeAgentMetadata 通知 → send_kv_to_decode/_build_transfer_params 地址换算 → batch_transfer_sync_write RDMA 直写 → TRANS_DONE 回执 → request_finished 延迟释放，含部分前缀命中/TP 分片/超时兜底/异常处理）**，Pi-0.5 粒度 + 44 处 SrcLink |

### DeepInfer 专题

| 页面 | 说明 |
|------|------|
| **DeepInfer 剖面（8 页）** | iframe 嵌入 `public/deepinfer-explained/` 静态教学站（固定 DeepInfer commit `5537415`，中文源码导读，无 GPU 实测）：整机剖面 / 请求与调度 / 运行时与异步 / 模型与注意力 / 采样与结构 / 测量与效率 / 生产恢复 / 整机图谱，说明 DeepInfer（DeepSeek 生产推理引擎开源版）每个模块负责什么、数据怎样传递、执行顺序为什么成立 |
| **mini-DeepInfer 教学引擎** | 面向 Ascend 910C 的精简教学推理引擎（Python + PyTorch）：一条请求从调度、模型执行、采样到结果提交的完整路径；不用真实权重也能跑（整数 Runner / 随机小模型），910C 上用 Qwen3.5-0.8B/2B 真实权重做投机解码验证。整合页含最小执行循环、核心对象、三种执行方式、DeepInfer 源码映射与实机验证记录 |
| **十四课学习路径** | 从单请求到批次调度、从函数返回到设备完成、再到跨轮分块，每课一个要回答的问题与可运行入口：①跟踪一个请求 ②真实权重与 KV Cache ③同步批处理 ④Qwen3.5 的两种缓存 ⑤缓存为什么还不能还 ⑥NPU 算完 CPU 就能读吗 ⑦结果回来后再提交进度 ⑧BatchEngine 分步执行 ⑨等待期间准备新文本 ⑩先准备采样索引 ⑪下一轮先发出去 ⑫请求结束下一轮已发出 ⑬新请求放进哪一轮 ⑭发出去了不等于已提交 |

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
| **Qwen3.8 vs DeepSeek V4 架构 3D** | 并排对比两大 2026 新架构的 3D 可视化：内置 8 个模型可任意两两对比（Qwen3.8 / DeepSeek V4 / Kimi K3 / GLM-5 / Gemma 4 / MiniMax M2.5 / Step 3.5 / 2017 原始 Transformer），Story mode 分章节导览、token 流动动画、组件点击聚焦与暗/亮主题切换，模块附真实来源参数标注 |
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
| 调度模块源码分析 | ✅ 服务调度/vllm-scheduler（V1 三步主循环 + AsyncScheduler） | — | — | ✅ 服务调度/sglang-scheduler（Radix 调度器 + PrefillAdder） |
| KV Cache 管理 | ✅ PagedAttention | ✅ (继承) | ✅ PagedAttention | ✅ RadixAttention |
| 内存管理 (BlockManager) | ✅ | ✅ | ✅ | — |
| 模型执行 (ModelRunner) | ✅ | ✅ | ✅ | — |
| 硬件抽象 | ✅ (内置) | ✅ (插件) | ✅ (直接集成) | ✅ (统一抽象) |
| 并行策略 | ✅ TP/PP/DP/EP/CP | ✅ TP/EP | ✅ TP | ✅ TP/PP/DP/EP/SP |
| 前缀缓存 | ✅ APC | ✅ (继承) | ✅ | ✅ Radix Tree |
| 图编译 | ✅ CUDA Graph | ✅ | ✅ torchair | ✅ |

### DeepInfer 专题

| 维度 | DeepInfer 剖面 | mini-DeepInfer 十四课 | nano-vLLM → DeepInfer |
|------|---------------|----------------------|------------------------|
| 形式 | 8 页静态剖面教学站（iframe 嵌入） | 14 个源码级课程页 + 整合页 | 34 节增量改写路线整合页 |
| 内容 | 整机剖面 → 单机制拆解（请求/调度/运行时/模型/采样/性能/生产/图谱） | 一条请求从提交到回收的每一步（可运行） | 从 nano-vllm 增量改写成 DeepInfer（复现 → 实现 → 验收） |
| 数据来源 | DeepInfer commit `5537415`（中文导读，无 GPU 实测） | AkiYangDev/mini-deepinfer（Ascend 910C + Qwen3.5 实机验证） | justkyriecai/nanovllm2deepinfer（个人学习项目） |
| 互补关系 | 讲"现成引擎内部长什么样" | 讲"一条可运行的 Python 代码路径" | 讲"怎么一步步做出来" |

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
| `/vllm-scheduler` | vLLM 调度模块 |
| `/sglang-scheduler` | SGLang 调度模块 |
| `/router` | AIBrix |
| `/sglang-gateway` | SGLang Model Gateway |
| `/vllm-router` | vLLM Router |
| `/mooncake` | Mooncake 概览 |
| `/attention-close-reading` | Attention (精读) |
| `/attention-en` | Attention (论文-EN) |
| `/infratech` | InfraTech |
| `/llm-learning` | 推理框架学习资料 |
| `/nanovllm2deepinfer` | nano-vLLM → DeepInfer |

### DeepInfer

| 路由 | 页面 |
|------|------|
| `/deepinfer/index` | 总览（整机剖面） |
| `/deepinfer/scheduling` | 请求与调度 |
| `/deepinfer/runtime` | 运行时与异步 |
| `/deepinfer/model` | 模型与注意力 |
| `/deepinfer/sampling` | 采样与结构 |
| `/deepinfer/performance` | 测量与效率 |
| `/deepinfer/production` | 生产恢复 |
| `/deepinfer/atlas` | 整机图谱 |
| `/deepinfer/mini` | mini-DeepInfer 教学引擎（整合页） |
| `/deepinfer/lesson/1` … `/deepinfer/lesson/14` | mini-DeepInfer 十四课（第 1–14 课） |

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
| `/arch-compare-3d` | Qwen3.8 vs DeepSeek V4 架构 3D |
| `/transformer-explainer` | Transformer Explainer (GPT-2) |
| `/business-process` | LLM 业务处理视图 |
| `/login` | 重定向首页（登录墙已移除，旧书签兼容） |

## 包含的图表类型

### 架构图 (Flowchart)

- 通用 LLM 推理分层架构图
- vLLM V1 多进程架构图（API Server / Engine Core / GPU Worker / DP Coordinator）
- vLLM-Ascend 硬件可插拔架构图
- nano-vLLM-NPU 精简架构图
- SGLang 整体架构图
- Mooncake KVCache-Centric 架构图
- **Mooncake 非池化 P/D 分离 KV Cache 存取业务流程图（§4.6，端到端业务视角）**
- Mooncake 两种传输引擎架构图
- HIXL + Mooncake 分层架构图
- LLM-DataDist V2 架构图
- Ascend MemCache 架构图
- KV Pool 分层存储架构图
- MemFabric OneCopy 数据流图
- FabricMem 超节点全局内存池图
- **mini-DeepInfer 最小执行循环图（接收请求 → 调度 → 预留缓存 → 元数据 → 模型计算 → 采样 → 提交进度 → 停止判断 → 回收资源）**
- **nano-vLLM → DeepInfer 学习路径依赖图（34 节按章节依赖组织的 flowchart）**
- **MTR 训练流程 / 编码器-解码器架构图**
- **UniAD 六任务端到端架构图**
- **Cosmos-Framework 仓库整体布局 / 三层配置系统图**
- **vLLM V1 调度一次 step 生命周期图**
- **SGLang 调度一次 iter 决策图 / PrefillAdder 预算决策图 / Radix Cache 驱逐流程图**
- **vLLM RequestStatus 状态转移图**
- **AsyncScheduler schedule/execute 重叠时序图**
- **服务调度概览双引擎架构对照图（vLLM EngineCore 单进程 vs SGLang 独立调度进程）**

### 时序图 (Sequence Diagram)

- 通用请求处理生命周期
- vLLM 请求处理时序图
- vLLM-Ascend 请求处理时序图
- SGLang RadixAttention 请求处理时序图
- Mooncake P/D 分离全流程时序图（4 阶段）
- **Mooncake 非池化 P/D 分离 KV Cache 存取全流程时序图（§4.6，组件 + 代码标注）**
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

### 其他（静态站内嵌可视化）

- DeepInfer 剖面 8 页内嵌的交互图：静态结构图、参数对照轻量交互、时间依赖机制连续播放/暂停/回看（运动时间与小尺寸数据为教学示意，非硬件 trace）

## 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite 8
- **样式方案**: Tailwind CSS 4
- **图表渲染**: Mermaid.js（支持缩放/拖拽）
- **路由**: React Router 7
- **页面导出**: html2pdf.js + turndown（PDF/HTML/Markdown）
- **内容来源**: 路由级代码分割 + iframe 嵌入 `public/` 下静态站（DeepInfer 剖面 / 3D 可视化）

## 构建部署

```bash
# 生产构建
npm run build

# 预览构建产物
npm run preview
```

构建产物输出到 `dist/` 目录，可直接部署到任意静态文件服务器（Nginx / CDN 等）。`public/` 下静态资源（`inferflux/`、`deepinfer-explained/`）会一并拷入构建产物。

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

### DeepInfer & mini-DeepInfer

| 资源 | 链接 |
|------|------|
| DeepInfer GitHub | https://github.com/deepseek-ai/DeepInfer |
| DeepInfer 剖面在线阅读 | https://asher-xunzhang.github.io/deepinfer-explained/ |
| mini-DeepInfer | https://github.com/AkiYangDev/mini-deepinfer |
| nanovllm2deepinfer | https://github.com/justkyriecai/nanovllm2deepinfer |
| nano-vLLM | https://github.com/GeeeekExplorer/nano-vllm |

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
