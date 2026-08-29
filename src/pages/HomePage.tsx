import { Link } from 'react-router-dom';

const frameworks = [
  {
    to: '/vllm',
    icon: '⚡',
    name: 'vLLM',
    desc: 'UC Berkeley 开源的 LLM 推理引擎，PagedAttention 核心创新，支持 200+ 模型，OpenAI 兼容 API',
    tags: ['PagedAttention', 'Continuous Batching', 'CUDA/HIP'],
  },
  {
    to: '/vllm-ascend',
    icon: '🔌',
    name: 'vLLM-Ascend',
    desc: 'vLLM 的华为昇腾 NPU 硬件插件，通过硬件可插拔接口实现 CANN + TorchNPU 适配',
    tags: ['CANN 9.1', 'TorchNPU', '硬件插件', 'Ascend 910C'],
  },
  {
    to: '/nano-vllm',
    icon: '🧪',
    name: 'nano-vLLM-NPU',
    desc: '轻量级推理引擎，代码量小、功能完整，专为学习和理解推理流程设计，支持 Ascend NPU',
    tags: ['Ascend C', 'torchair', 'PageAttention', '图编译'],
  },
  {
    to: '/sglang',
    icon: '🚀',
    name: 'SGLang',
    desc: 'LMSYS 组织的高性能推理框架，RadixAttention 前缀缓存创新，零开销调度器，40 万 GPU 部署',
    tags: ['RadixAttention', '零开销调度', '分离式架构', '多硬件'],
  },
];

export function HomePage() {
  return (
    <div className="prose max-w-none">
      <div className="text-center py-8">
        <h1 className="gradient-text" style={{ fontSize: '2.5rem', border: 'none', padding: 0, margin: '0 0 8px' }}>
          LLM 推理框架学习指南
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: '1.1rem' }}>
          深入理解主流 LLM 推理框架的架构设计与实现原理
        </p>
      </div>

      {/* Framework cards */}
      <div className="grid grid-cols-2 gap-4 mt-8">
        {frameworks.map(({ to, icon, name, desc, tags }) => (
          <Link key={to} to={to} className="no-underline" style={{ color: 'inherit' }}>
            <div className="glass p-6 h-full transition-all hover:border-indigo-500/50 cursor-pointer">
              <div className="text-2xl mb-2">{icon} <span className="font-bold text-lg ml-1">{name}</span></div>
              <p className="text-sm mb-3" style={{ color: 'var(--text2)' }}>{desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Learning path */}
      <div className="glass p-6 mt-6">
        <h2 style={{ border: 'none', margin: '0 0 16px' }}>📚 学习路径</h2>
        <div className="space-y-3" style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>
          <div className="flex items-center gap-3">
            <span className="tag" style={{ background: 'var(--accent)', color: 'white' }}>1</span>
            <Link to="/overview" style={{ color: 'var(--accent)' }}>先看总体架构对比</Link> — 了解各框架的设计理念和核心差异
          </div>
          <div className="flex items-center gap-3">
            <span className="tag" style={{ background: 'var(--accent)', color: 'white' }}>2</span>
            <Link to="/vllm" style={{ color: 'var(--accent)' }}>深入 vLLM</Link> — 学习 PagedAttention、Scheduler、BlockManager 等核心模块
          </div>
          <div className="flex items-center gap-3">
            <span className="tag" style={{ background: 'var(--accent)', color: 'white' }}>3</span>
            <Link to="/vllm-ascend" style={{ color: 'var(--accent)' }}>理解 vLLM-Ascend 硬件插件</Link> — 学习如何将推理框架适配昇腾 NPU
          </div>
          <div className="flex items-center gap-3">
            <span className="tag" style={{ background: 'var(--accent)', color: 'white' }}>4</span>
            <Link to="/nano-vllm" style={{ color: 'var(--accent)' }}>动手实践 nano-vLLM-NPU</Link> — 通过精简代码库深入理解推理全流程
          </div>
          <div className="flex items-center gap-3">
            <span className="tag" style={{ background: 'var(--accent)', color: 'white' }}>5</span>
            <Link to="/sglang" style={{ color: 'var(--accent)' }}>探索 SGLang</Link> — 学习 RadixAttention 和零开销调度器
          </div>
          <div className="flex items-center gap-3">
            <span className="tag" style={{ background: 'var(--accent)', color: 'white' }}>6</span>
            <Link to="/comparison" style={{ color: 'var(--accent)' }}>框架横向对比</Link> — 性能、架构、适用场景的全面对比
          </div>
        </div>
      </div>

      {/* External resources */}
      <div className="glass p-6 mt-6">
        <h2 style={{ border: 'none', margin: '0 0 16px' }}>🔗 外部资源汇总</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ResourceLink href="https://github.com/vllm-project/vllm" label="vLLM GitHub" />
          <ResourceLink href="https://docs.vllm.ai" label="vLLM 官方文档" />
          <ResourceLink href="https://github.com/vllm-project/vllm-ascend" label="vLLM-Ascend GitHub" />
          <ResourceLink href="https://github.com/xtms/nano-vllm-npu" label="nano-vLLM-NPU" />
          <ResourceLink href="https://github.com/sgl-project/sglang" label="SGLang GitHub" />
          <ResourceLink href="https://docs.sglang.io" label="SGLang 官方文档" />
          <ResourceLink href="https://arxiv.org/abs/2309.06180" label="PagedAttention 论文 (SOSP 2023)" />
          <ResourceLink href="https://blog.vllm.ai/2023/06/20/vllm.html" label="vLLM 技术博客" />
        </div>
      </div>
    </div>
  );
}

function ResourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 rounded-lg transition-colors" style={{ color: 'var(--text2)', textDecoration: 'none' }}>
      <span>🔗</span> {label} <span className="text-xs" style={{ color: 'var(--text3)' }}>→</span>
    </a>
  );
}