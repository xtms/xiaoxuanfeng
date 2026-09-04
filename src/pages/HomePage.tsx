import { Link } from 'react-router-dom';

const stats = [
  { value: '4', label: '主流框架' },
  { value: '200+', label: '模型架构' },
  { value: '40万+', label: 'GPU 部署规模' },
  { value: '5x', label: '前缀缓存加速比' },
];

const knowledgeCards = [
  {
    to: '/vllm',
    title: 'vLLM',
    desc: 'PagedAttention 核心创新，Continuous Batching，支持 200+ 模型的高性能推理引擎',
    count: '3 篇',
    color: '#3451b2',
  },
  {
    to: '/vllm-ascend',
    title: 'vLLM-Ascend',
    desc: '华为昇腾 NPU 硬件插件，通过可插拔接口实现 CANN + TorchNPU 适配',
    count: '1 篇',
    color: '#7c3aed',
  },
  {
    to: '/nano-vllm',
    title: 'nano-vLLM-NPU',
    desc: '轻量级推理引擎，~1,900 行代码，专为学习和理解推理流程设计',
    count: '1 篇',
    color: '#059669',
  },
  {
    to: '/sglang',
    title: 'SGLang',
    desc: 'RadixAttention 前缀缓存，Rust 零开销调度器，40 万 GPU 部署规模',
    count: '1 篇',
    color: '#dc2626',
  },
  {
    to: '/kv-cache',
    title: 'KV Cache 专题',
    desc: 'KV Cache 管理方案对比，SGLang vs vLLM 机制深度解析',
    count: '4 篇',
    color: '#d97706',
  },
  {
    to: '/pd-separation',
    title: 'P/D 分离 & 调度',
    desc: 'Prefill/Decode 分离架构、服务调度策略与 Router 网关设计',
    count: '5 篇',
    color: '#0891b2',
  },
];

export function HomePage() {
  return (
    <div className="prose max-w-none">
      {/* Hero — AIInfraGuide style */}
      <div className="hero">
        <h1 style={{ color: 'var(--vp-c-text-1)', fontSize: '2.25rem' }}>LLM 推理框架学习指南</h1>
        <p style={{ fontSize: '1.05rem', marginBottom: 8 }}>从零开始深入理解主流 LLM 推理框架的架构设计与实现原理</p>
        <p style={{ fontSize: '0.9rem', color: 'var(--vp-c-text-3)' }}>
          涵盖 vLLM、vLLM-Ascend、nano-vLLM-NPU 和 SGLang 四大框架，从 Attention 基础到 P/D 分离架构
        </p>
        <div className="page-header-actions" style={{ marginTop: 24 }}>
          <Link to="/overview" className="tag tag-accent no-underline" style={{ padding: '10px 24px', fontSize: '0.95rem', borderRadius: 'var(--radius)' }}>
            开始学习
          </Link>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="tag tag-outline no-underline" style={{ padding: '10px 24px', fontSize: '0.95rem', borderRadius: 'var(--radius)' }}>
            GitHub
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Knowledge base */}
      <h2>📚 知识库</h2>
      <p style={{ color: 'var(--vp-c-text-3)', margin: '0 0 20px', fontSize: '0.9rem' }}>
        系统化的 LLM 推理框架全栈核心知识
      </p>
      <div className="grid grid-cols-2 gap-3">
        {knowledgeCards.map(({ to, title, desc, count, color }) => (
          <Link key={to} to={to} className="no-underline" style={{ color: 'inherit' }}>
            <div className="glass-card h-full" style={{ padding: '24px 28px' }}>
              <div className="flex items-center gap-3 mb-3">
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: color,
                }} />
                <span className="font-semibold" style={{ fontSize: '1.05rem', color: 'var(--vp-c-text-1)' }}>{title}</span>
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--vp-c-text-2)', lineHeight: 1.65, margin: '0 0 16px' }}>
                {desc}
              </p>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: '0.8rem', color: 'var(--vp-c-text-3)' }}>{count}</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--vp-c-brand)', fontWeight: 500 }}>探索 →</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Learning path */}
      <h2>🗺️ 学习路径</h2>
      <p style={{ color: 'var(--vp-c-text-3)', margin: '0 0 20px', fontSize: '0.9rem' }}>
        从入门到精通的推荐学习顺序
      </p>
      <div className="glass-card" style={{ padding: '16px 0' }}>
        <div className="learning-path">
          <PathStep num={1} title={<><Link to="/overview">总体架构对比</Link></>} desc="了解各框架的设计理念和核心差异，建立全局认知" />
          <PathStep num={2} title={<><Link to="/attention-close-reading">Attention 机制精读</Link></>} desc="深入理解 Transformer 论文，掌握 Attention 原理，这是所有推理框架的理论基础" />
          <PathStep num={3} title={<><Link to="/vllm-quickstart">vLLM 快速入门</Link></>} desc="动手实践，从安装到运行第一个推理任务，快速体验 vLLM" />
          <PathStep num={4} title={<><Link to="/vllm">深入 vLLM</Link> + <Link to="/vllm-arch">vLLM 架构详解</Link></>} desc="学习 PagedAttention、Scheduler、BlockManager 等核心模块及架构设计" />
          <PathStep num={5} title={<><Link to="/vllm-ascend">vLLM-Ascend 硬件插件</Link></>} desc="理解如何通过插件化接口将推理框架适配华为昇腾 NPU" />
          <PathStep num={6} title={<><Link to="/nano-vllm">nano-vLLM-NPU</Link></>} desc="通过精简代码库（~1,900 行）动手实践，深入理解推理全流程" />
          <PathStep num={7} title={<><Link to="/sglang">探索 SGLang</Link></>} desc="学习 RadixAttention 前缀缓存和 Rust 零开销调度器的创新设计" />
          <PathStep num={8} title={<><Link to="/comparison">框架横向对比</Link></>} desc="性能、架构、适用场景的全面对比，选择最适合的方案" />
          <PathStep num={9} title={<><Link to="/kv-cache">框架专题</Link>：<Link to="/kv-cache">KV Cache</Link> · <Link to="/kv-pool">KV Pool</Link> · <Link to="/pd-separation">P/D 分离</Link> · <Link to="/serving-scheduler">服务调度</Link></>} desc="深入五大核心专题：KV Cache 管理、KV Pool 池化、P/D 分离架构、调度策略、Router 网关" />
          <PathStep num={10} title={<><Link to="/attention-en">Attention 论文原文</Link></>} desc="阅读英文原版 'Attention Is All You Need'，配合精读加深理解" />
          <PathStep num={11} title={<><Link to="/infratech">InfraTech 基础设施</Link></>} desc="了解 AI Infra 底层技术栈，涵盖训练推理框架、性能加速、深度学习与基础硬件" />
        </div>
      </div>

      {/* External resources */}
      <h2>🔗 外部资源</h2>
      <p style={{ color: 'var(--vp-c-text-3)', margin: '0 0 20px', fontSize: '0.9rem' }}>
        论文、文档与参考实现
      </p>
      <div className="grid grid-cols-2 gap-3">
        <ResourceLink href="https://github.com/vllm-project/vllm" label="vLLM GitHub" />
        <ResourceLink href="https://docs.vllm.ai" label="vLLM 官方文档" />
        <ResourceLink href="https://github.com/vllm-project/vllm-ascend" label="vLLM-Ascend GitHub" />
        <ResourceLink href="https://github.com/xtms/nano-vllm-npu" label="nano-vLLM-NPU" />
        <ResourceLink href="https://github.com/sgl-project/sglang" label="SGLang GitHub" />
        <ResourceLink href="https://docs.sglang.io" label="SGLang 官方文档" />
        <ResourceLink href="https://arxiv.org/abs/2309.06180" label="PagedAttention 论文" />
        <ResourceLink href="https://arxiv.org/abs/1706.03762" label="Transformer 论文" />
        <ResourceLink href="https://jalammar.github.io/illustrated-transformer/" label="Illustrated Transformer" />
        <ResourceLink href="https://github.com/karpathy/nanoGPT" label="nanoGPT" />
      </div>
    </div>
  );
}

function PathStep({ num, title, desc }: { num: number; title: React.ReactNode; desc: string }) {
  return (
    <div className="path-step">
      <div className="path-step-num">{num}</div>
      <div className="path-step-content">
        <h4>{title}</h4>
        <p>{desc}</p>
      </div>
    </div>
  );
}

function ResourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="glass-card no-underline flex items-center gap-3"
      style={{ padding: '14px 18px', color: 'var(--vp-c-text-2)', fontSize: '0.9rem' }}
    >
      <span style={{ color: 'var(--vp-c-brand)', fontSize: '1.1rem' }}>🔗</span>
      <span>{label}</span>
      <span style={{ color: 'var(--vp-c-text-3)', marginLeft: 'auto', fontSize: '0.8rem' }}>↗</span>
    </a>
  );
}