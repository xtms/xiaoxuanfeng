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