# LLM 推理框架学习指南

深入理解主流 LLM 推理框架的架构设计与实现原理，涵盖 vLLM、vLLM-Ascend、nano-vLLM-NPU、SGLang 四大框架，以及 KV Cache、P/D 分离、KV Pool、服务调度、Mooncake 等专题。

## 快速开始

```bash
npm install
npm run dev
```

## 项目结构

```
xiaoxuanfeng/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx                    # 应用入口
│   ├── App.tsx                     # 路由配置
│   ├── index.css                   # 全局样式（浅色主题）
│   ├── components/
│   │   ├── Layout.tsx              # 侧边栏导航 + 右侧目录 + 导出按钮
│   │   ├── MermaidDiagram.tsx      # Mermaid 图表渲染（支持缩放/拖拽）
│   │   ├── CodeBlock.tsx           # 代码块 / Callout / 资源表格
│   │   ├── TableOfContents.tsx     # 右侧目录自动生成
│   │   ├── ExportButton.tsx        # 页面导出（PDF/HTML/Markdown）
│   │   └── BackToTop.tsx           # 回到顶部
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
│       ├── KVPoolPage.tsx          # KV Pool 概览
│       ├── MemCachePage.tsx        # Ascend MemCache
│       ├── MooncakeKVPoolPage.tsx  # Mooncake KVPool (HIXL)
│       ├── MooncakePage.tsx        # Mooncake 总览
│       ├── PDSeparationPage.tsx    # P/D 分离
│       ├── ServingSchedulerPage.tsx # 服务调度
│       └── RouterPage.tsx          # 服务调度器
```

## 侧边栏结构

```
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
├── KV Pool
│   ├── 概览
│   ├── Mooncake KVPool
│   └── Ascend MemCache
├── P/D 分离
├── 服务调度
├── 服务调度器
└── Mooncake
    ├── 概览
    └── KVPool (HIXL)
Attention (精读)
Attention (论文-EN)
InfraTech
```

## 内容覆盖

### 框架分析

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

### 框架专题

| 页面 | 说明 |
|------|------|
| **KV Cache** | KV Cache 数学原理、4 种管理方案（重计算/共享前缀/压缩/溢出）、PagedAttention、RadixAttention、GQA/MQA、量化 |
| **KV Pool 概览** | 内存共享机制（GlobalPageTable + 引用计数）、分层存储 HBM→DRAM→SSD、P/D 分离交互、业界方案对比 |
| **Mooncake KVPool** | HIXL Engine 详解、UB 协议、LLM-DataDist V2、多链路拓扑、FabricMem、vllm-ascend 部署 |
| **Ascend MemCache** | MetaService + LocalService 架构、MemFabric OneCopy、7 种硬件路径、KV Block API、vllm-ascend 集成 |
| **P/D 分离** | Prefill/Decode 解耦原理、KV Cache 传输（NCCL/RDMA/Mooncake）、调度策略、vLLM/SGLang/Mooncake 实现对比 |
| **服务调度** | Continuous Batching、Chunked Prefill、抢占策略、前缀感知调度、公平性调度 |
| **服务调度器** | sgl-router（缓存感知路由）、LiteLLM、Triton、TGI Router、Nginx/Envoy 代理 |
| **Mooncake 概览** | KVCache-Centric 架构、Master Server + Transfer Engine 核心组件、请求生命周期、P/D 分离核心作用（拓扑感知配对、多轮对话优化、故障恢复）、Layer-wise Pipeline、去重传输、两种传输引擎对比（Transfer Engine vs HIXL Engine） |

### 其他

| 页面 | 说明 |
|------|------|
| **Attention (精读)** | Transformer Attention 机制深入解析 |
| **Attention (论文-EN)** | "Attention Is All You Need" 论文精读 |
| **InfraTech** | 推理基础设施技术栈 |

## 各框架核心模块覆盖

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

## 页面路由

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
| `/kv-cache` | KV Cache |
| `/kv-pool` | KV Pool 概览 |
| `/mooncake-kvpool` | Mooncake KVPool |
| `/memcache` | Ascend MemCache |
| `/pd-separation` | P/D 分离 |
| `/serving-scheduler` | 服务调度 |
| `/router` | 服务调度器 |
| `/mooncake` | Mooncake 概览 |
| `/attention-close-reading` | Attention (精读) |
| `/attention-en` | Attention (论文-EN) |
| `/infratech` | InfraTech |

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