import { Link } from 'react-router-dom';

const frameworks = [
  {
    to: '/vllm',
    name: 'vLLM',
    desc: 'UC Berkeley 开源的 LLM 推理引擎，PagedAttention 核心创新，支持 200+ 模型，OpenAI 兼容 API',
    tags: ['PagedAttention', 'Continuous Batching', 'CUDA/HIP'],
    color: '#0284c7',
  },
  {
    to: '/vllm-ascend',
    name: 'vLLM-Ascend',
    desc: 'vLLM 的华为昇腾 NPU 硬件插件，通过硬件可插拔接口实现 CANN + TorchNPU 适配',
    tags: ['CANN 9.1', 'TorchNPU', '硬件插件', 'Ascend 910C'],
    color: '#7c3aed',
  },
  {
    to: '/nano-vllm',
    name: 'nano-vLLM-NPU',
    desc: '轻量级推理引擎，代码量小、功能完整，专为学习和理解推理流程设计，支持 Ascend NPU',
    tags: ['Ascend C', 'torchair', 'PageAttention', '图编译'],
    color: '#059669',
  },
  {
    to: '/sglang',
    name: 'SGLang',
    desc: 'LMSYS 组织的高性能推理框架，RadixAttention 前缀缓存创新，零开销调度器，40 万 GPU 部署',
    tags: ['RadixAttention', '零开销调度', '分离式架构', '多硬件'],
    color: '#dc2626',
  },
];

const stats = [
  { value: '4', label: '主流框架' },
  { value: '200+', label: '模型架构' },
  { value: '40万+', label: 'GPU 部署规模' },
  { value: '5x', label: '前缀缓存加速比' },
];

const features = [
  { icon: '🧠', title: 'PagedAttention', desc: 'KV Cache 分页管理，消除内存碎片，内存利用率从 ~25% 提升至 99%+' },
  { icon: '🌳', title: 'RadixAttention', desc: 'Radix Tree 前缀缓存，自动检测和复用共享前缀，最高 5x 加速' },
  { icon: '⚙️', title: 'Continuous Batching', desc: '动态批处理，prefill 和 decode 自由混合调度，最大化 GPU 利用率' },
  { icon: '🔌', title: '硬件可插拔', desc: 'RFC 标准插件接口，不侵入核心代码，支持 Ascend NPU 等多硬件平台' },
  { icon: '🦀', title: '零开销调度', desc: 'Rust 实现的高性能 CPU 调度器，调度开销近乎为零' },
  { icon: '📊', title: 'Chunked Prefill', desc: '长 prefill 分块与 decode 交替执行，显著降低首 token 延迟' },
];

export function HomePage() {
  return (
    <div className="prose max-w-none">
      {/* Hero */}
      <div className="hero">
        <h1 className="gradient-text">LLM 推理框架学习指南</h1>
        <p>深入理解主流 LLM 推理框架的架构设计与实现原理，涵盖 vLLM、vLLM-Ascend、nano-vLLM-NPU 和 SGLang 四大框架</p>
        <div className="page-header-actions" style={{ marginTop: 20 }}>
          <Link to="/overview" className="tag tag-accent no-underline" style={{ padding: '8px 20px', fontSize: '0.9rem' }}>
            开始学习 →
          </Link>
          <Link to="/comparison" className="tag tag-outline no-underline" style={{ padding: '8px 20px', fontSize: '0.9rem' }}>
            框架对比
          </Link>
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

      {/* Feature highlights */}
      <h2 style={{ border: 'none', margin: '40px 0 4px', fontSize: '1.3rem' }}>核心概念</h2>
      <p className="text-sm" style={{ color: 'var(--text3)', margin: '0 0 16px' }}>
        所有推理框架共享的核心技术概念
      </p>
      <div className="feature-grid">
        {features.map((f) => (
          <div key={f.title} className="feature-card">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Framework cards */}
      <h2 style={{ border: 'none', margin: '40px 0 4px', fontSize: '1.3rem' }}>四大框架</h2>
      <p className="text-sm" style={{ color: 'var(--text3)', margin: '0 0 16px' }}>
        每个框架的设计理念与核心创新
      </p>
      <div className="grid grid-cols-2 gap-4">
        {frameworks.map(({ to, name, desc, tags, color }) => (
          <Link key={to} to={to} className="no-underline" style={{ color: 'inherit' }}>
            <div className="glass-card h-full">
              <div className="flex items-center gap-3 mb-3">
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', background: color,
                  boxShadow: `0 0 8px ${color}40`,
                }} />
                <span className="font-bold text-lg">{name}</span>
              </div>
              <p className="text-sm mb-3" style={{ color: 'var(--text2)', lineHeight: 1.6 }}>{desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => <span key={t} className="tag tag-outline">{t}</span>)}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Learning path */}
      <h2 style={{ border: 'none', margin: '40px 0 4px', fontSize: '1.3rem' }}>学习路径</h2>
      <p className="text-sm" style={{ color: 'var(--text3)', margin: '0 0 16px' }}>
        从入门到精通的推荐学习顺序
      </p>
      <div className="glass-card" style={{ padding: '16px 0' }}>
        <div className="learning-path">
          <div className="path-step">
            <div className="path-step-num">1</div>
            <div className="path-step-content">
              <h4><Link to="/overview">总体架构对比</Link></h4>
              <p>了解各框架的设计理念和核心差异，建立全局认知</p>
            </div>
          </div>
          <div className="path-step">
            <div className="path-step-num">2</div>
            <div className="path-step-content">
              <h4><Link to="/vllm">深入 vLLM</Link></h4>
              <p>学习 PagedAttention、Scheduler、BlockManager 等核心模块</p>
            </div>
          </div>
          <div className="path-step">
            <div className="path-step-num">3</div>
            <div className="path-step-content">
              <h4><Link to="/vllm-ascend">理解 vLLM-Ascend 硬件插件</Link></h4>
              <p>学习如何通过插件化接口将推理框架适配昇腾 NPU</p>
            </div>
          </div>
          <div className="path-step">
            <div className="path-step-num">4</div>
            <div className="path-step-content">
              <h4><Link to="/nano-vllm">动手实践 nano-vLLM-NPU</Link></h4>
              <p>通过精简代码库（~1,900 行）深入理解推理全流程</p>
            </div>
          </div>
          <div className="path-step">
            <div className="path-step-num">5</div>
            <div className="path-step-content">
              <h4><Link to="/sglang">探索 SGLang</Link></h4>
              <p>学习 RadixAttention 和 Rust 零开销调度器的创新设计</p>
            </div>
          </div>
          <div className="path-step">
            <div className="path-step-num">6</div>
            <div className="path-step-content">
              <h4><Link to="/comparison">框架横向对比</Link></h4>
              <p>性能、架构、适用场景的全面对比，选择最适合的方案</p>
            </div>
          </div>
        </div>
      </div>

      {/* External resources */}
      <h2 style={{ border: 'none', margin: '40px 0 4px', fontSize: '1.3rem' }}>外部资源</h2>
      <p className="text-sm" style={{ color: 'var(--text3)', margin: '0 0 16px' }}>
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
      style={{ padding: '14px 18px', color: 'var(--text2)', fontSize: '0.9rem' }}
    >
      <span style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>🔗</span>
      <span>{label}</span>
      <span style={{ color: 'var(--text3)', marginLeft: 'auto', fontSize: '0.8rem' }}>↗</span>
    </a>
  );
}