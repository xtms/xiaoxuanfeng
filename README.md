# LLM 推理框架学习指南

深入理解主流 LLM 推理框架的架构设计与实现原理，涵盖 vLLM、vLLM-Ascend、nano-vLLM-NPU 和 SGLang 四大框架。

## 快速开始

```bash
cd /data/sd/xiaoxuanfeng
npm install
npm run dev
```

## 项目结构

```
data/sd/xiaoxuanfeng/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx                    # 应用入口
│   ├── App.tsx                     # 路由配置
│   ├── index.css                   # 暗色主题全局样式
│   ├── components/
│   │   ├── Layout.tsx              # 侧边栏导航布局组件
│   │   ├── MermaidDiagram.tsx      # Mermaid 图表渲染组件
│   │   └── CodeBlock.tsx           # 代码块 / Callout / 外部链接等通用组件
│   └── pages/
│       ├── HomePage.tsx            # 首页 — 框架卡片 + 学习路径
│       ├── OverviewPage.tsx        # 总体架构 — 总览对比 + 模块分析
│       ├── VLLMPage.tsx            # vLLM — 深入架构与核心模块
│       ├── VLLMAscendPage.tsx      # vLLM-Ascend — 昇腾 NPU 硬件插件
│       ├── NanoVLLMPage.tsx        # nano-vLLM-NPU — 精简教育推理引擎
│       ├── SGLangPage.tsx          # SGLang — RadixAttention 与零开销调度
│       └── ComparisonPage.tsx      # 框架对比 — 多维度横向对比
```

## 内容覆盖

### 按"总-分-总"模式组织

| 层级 | 页面 | 说明 |
|------|------|------|
| **总** | 首页 | 四大框架概览卡片、结构化学习路径（6 步） |
| **总** | 总体架构 | 通用推理架构图、框架总览对比表、请求生命周期、核心模块对比 |
| **分** | vLLM | PagedAttention 原理、多进程架构、5 大核心模块（Engine/Scheduler/BlockManager/Worker/ModelRunner）、类图、关键特性 |
| **分** | vLLM-Ascend | 硬件可插拔插件架构、CANN 软件栈、6 个与 CUDA vLLM 的关键差异 |
| **分** | nano-vLLM-NPU | 精简架构（~2,428 行）、Qwen3-0.6B 模型结构、三种 Attention 实现、NPU 优化技术（torchair 图编译/融合算子/自定义算子）、性能基准 |
| **分** | SGLang | RadixAttention 前缀树、零开销 CPU 调度器、Prefill-Decode 分离架构、5 个设计影响来源 |
| **总** | 框架对比 | 10 维度综合对比表、KV Cache 管理对比、调度策略对比、硬件抽象对比、技术栈对比、适用场景推荐 |

### 各框架核心模块覆盖

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

## 包含的图表类型

### 架构图 (Flowchart)

- 通用 LLM 推理分层架构图
- vLLM V1 多进程架构图（API Server / Engine Core / GPU Worker / DP Coordinator）
- vLLM-Ascend 硬件可插拔架构图（vLLM 核心 → 插件 → CANN → Ascend 硬件）
- nano-vLLM-NPU 精简架构图（用户接口 → 引擎层 → 模型执行层 → 硬件层）
- SGLang 整体架构图（前端接入 → 推理引擎 → 执行层 → 多硬件）
- Qwen3-0.6B 模型结构图（28 × DecoderLayer）
- KV Cache 管理对比图（PagedAttention vs RadixAttention）
- 技术栈对比图（四大框架的技术栈构成）

### 时序图 (Sequence Diagram)

- 通用请求处理生命周期（Client → API → Scheduler → Worker）
- vLLM 请求处理时序图（API Server → Engine Core → Scheduler → BlockManager → GPU Worker）
- vLLM-Ascend 请求处理时序图（API Server → LLMEngine → Ascend Platform → Ascend Worker → NPU）
- SGLang RadixAttention 请求处理时序图（含前缀缓存命中/未命中分支）

### 类图 (Class Diagram)

- vLLM 核心类关系图（LLMEngine → Scheduler / BlockManager → Worker → ModelRunner）

### 数据流图

- PagedAttention 逻辑序列到物理块映射图（Block Table 映射关系）
- RadixAttention Radix Tree 前缀共享示例图（4 个并发请求的前缀拆分与复用）

### 其他图表

- Prefill-Decode 分离架构图（Prefill Pool / Decode Pool 独立 GPU 集群）
- 学习路径图（首页 6 步学习路径）

## 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite 8
- **样式方案**: Tailwind CSS 4
- **图表渲染**: Mermaid.js
- **路由**: React Router 7

## 外部资源

| 资源 | 链接 |
|------|------|
| vLLM GitHub | https://github.com/vllm-project/vllm |
| vLLM 官方文档 | https://docs.vllm.ai |
| PagedAttention 论文 (SOSP 2023) | https://arxiv.org/abs/2309.06180 |
| vLLM 技术博客 | https://blog.vllm.ai/2023/06/20/vllm.html |
| vLLM-Ascend GitHub | https://github.com/vllm-project/vllm-ascend |
| vLLM-Ascend Docker 镜像 | https://quay.io/ascend/vllm-ascend |
| nano-vLLM-NPU | https://github.com/xtms/nano-vllm-npu |
| SGLang GitHub | https://github.com/sgl-project/sglang |
| SGLang 官方文档 | https://docs.sglang.io |
| LMSYS Org | https://lmsys.org |
| 昇腾社区 | https://www.hiascend.com |

## 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | 框架卡片 + 学习路径 |
| `/overview` | 总体架构 | 通用架构 + 框架对比 |
| `/vllm` | vLLM | PagedAttention + 核心模块 |
| `/vllm-ascend` | vLLM-Ascend | 昇腾 NPU 硬件插件 |
| `/nano-vllm` | nano-vLLM-NPU | 精简教育推理引擎 |
| `/sglang` | SGLang | RadixAttention + 零开销调度 |
| `/comparison` | 框架对比 | 多维度横向对比 |

## 构建部署

```bash
# 生产构建
npm run build

# 预览构建产物
npm run preview
```

构建产物输出到 `dist/` 目录，可直接部署到任意静态文件服务器（Nginx / CDN 等）。