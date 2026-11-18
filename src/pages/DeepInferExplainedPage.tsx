import { useParams, Navigate } from 'react-router-dom';
import { VisualizerPage } from './VisualizerPage';

/**
 * DeepInfer 剖面 — 以 iframe 嵌入 public/deepinfer-explained/ 下的 8 个静态 HTML 教学页。
 * 内容为社区"DeepInfer 剖面"中文源码导读站（固定 commit 5537415，无 GPU 实测），
 * 与本路线图 /nanovllm2deepinfer 互补：前者讲"DeepInfer 现成引擎内部长什么样"，
 * 后者讲"怎么一步步做出来"。
 */
const PAGES: Record<string, { title: string; desc: string; tags: string[] }> = {
  index: {
    title: 'DeepInfer 剖面 — 总览',
    desc: '整机剖面：模块与机制的对应关系、调用链。从文本、调度决策到设备上的 KV 与 kernel，沿真实调用关系读 DeepInfer 源码（固定 commit 5537415，分析日期 2026-10）。',
    tags: ['DeepInfer', '整机剖面', '调用链'],
  },
  scheduling: {
    title: 'DeepInfer 剖面 — 请求与调度',
    desc: '请求建档、分块 Prefill、DP 投票、内存不足时的抢占。调度器如何为每个请求维护状态、在 prefill/decode 之间投票切换，以及资源不足时的 victim 选择与抢占语义。',
    tags: ['DeepInfer', '请求', '调度', '抢占'],
  },
  runtime: {
    title: 'DeepInfer 剖面 — 运行时与异步',
    desc: '分页 KV 地址、引用和释放、ZOS 零开销异步调度、CUDA Graph。每步只同步一次的运行时设计，以及对象池、延迟释放如何把 CPU 从热路径上挤出去。',
    tags: ['DeepInfer', 'KV 寻址', 'ZOS 异步', 'CUDA Graph'],
  },
  model: {
    title: 'DeepInfer 剖面 — 模型与注意力',
    desc: 'V4.1-Flash 模型结构、稀疏/压缩注意力、YOCO、MoE、EPLB、并行与 kernel。逐组件拆解 MLA 压缩 KV、SWA 环、稀疏 indexer、Mega MoE 与分布式并行。',
    tags: ['DeepInfer', '模型', '注意力', 'MoE', '并行'],
  },
  sampling: {
    title: 'DeepInfer 剖面 — 采样与结构',
    desc: '采样器、DSpark、动态草稿预算、结构化输出。确定性 RNG、投机解码的 draft 预算分配，以及 grammar 位掩码如何在采样 kernel 内生效。',
    tags: ['DeepInfer', '采样', 'DSpark', '结构化输出'],
  },
  performance: {
    title: 'DeepInfer 剖面 — 测量与效率',
    desc: 'MFU 口径与交互算例、性能验证路径、公开代码与生产系统的边界。哪些指标能算、哪些只能测，以及源码教学与真实生产之间的证据边界。',
    tags: ['DeepInfer', 'MFU', '性能', '验证'],
  },
  production: {
    title: 'DeepInfer 剖面 — 生产恢复',
    desc: '生产路由与 Prefill 分桶、P/D 实例与卡数、请求/缓存双轨、StateBlock 生命周期、两类重放、角色与 flush，以及条件化工作点。',
    tags: ['DeepInfer', '生产', 'P/D 分离', 'StateBlock'],
  },
  atlas: {
    title: 'DeepInfer 剖面 — 整机图谱',
    desc: 'KV 内存布局、跨层复用来源与 YOCO 的 SWA 可见域静态对照。一张图看清所有 cache 的字节布局与别名关系。',
    tags: ['DeepInfer', 'KV 布局', '图谱', 'YOCO'],
  },
};

export function DeepInferExplainedPage() {
  const { page = 'index' } = useParams();
  const meta = PAGES[page];
  if (!meta) return <Navigate to="/deepinfer/index" replace />;
  return (
    <VisualizerPage
      title={meta.title}
      src={`/deepinfer-explained/${page}.html`}
      desc={meta.desc}
      tags={meta.tags}
      hint="iframe 内可使用其全站导航在 8 页间跳转；点击上方 ⛶ 全屏阅读或 ↗ 新标签页打开脱离本站布局。"
    />
  );
}
