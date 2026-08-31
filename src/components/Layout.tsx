import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { TableOfContents } from './TableOfContents';

const sidebar = [
  { to: '/', label: '🏠 首页', end: true },
  { to: '/overview', label: '📊 总体架构' },
  { to: '/vllm', label: '⚡ vLLM' },
  { to: '/vllm-ascend', label: '🔌 vLLM-Ascend' },
  { to: '/nano-vllm', label: '🧪 nano-vLLM-NPU' },
  { to: '/sglang', label: '🚀 SGLang' },
  { to: '/comparison', label: '🔍 框架对比' },
  { to: '/attention-close-reading', label: '🧠 Attention(精读)' },
  { to: '/attention-en', label: '📐 Attention(论文-EN)' },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      {/* Left Sidebar */}
      <aside className="w-52 flex-shrink-0 border-r h-screen sticky top-0 overflow-y-auto" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="p-5">
          <a href="/" className="text-lg font-bold no-underline gradient-text">LLM 推理框架</a>
          <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>学习指南</p>
        </div>
        <nav className="px-3 pb-6 space-y-0.5">
          {sidebar.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text3)' }}>外部资源</p>
          <div className="mt-2 space-y-1">
            <a href="https://github.com/vllm-project/vllm" target="_blank" rel="noreferrer" className="sidebar-link text-xs">🔗 vLLM GitHub</a>
            <a href="https://github.com/vllm-project/vllm-ascend" target="_blank" rel="noreferrer" className="sidebar-link text-xs">🔗 vLLM-Ascend</a>
            <a href="https://github.com/xtms/nano-vllm-npu" target="_blank" rel="noreferrer" className="sidebar-link text-xs">🔗 nano-vLLM</a>
            <a href="https://github.com/sgl-project/sglang" target="_blank" rel="noreferrer" className="sidebar-link text-xs">🔗 SGLang GitHub</a>
            <a href="https://arxiv.org/abs/1706.03762" target="_blank" rel="noreferrer" className="sidebar-link text-xs">📄 Transformer 论文</a>
            <a href="https://jalammar.github.io/illustrated-transformer/" target="_blank" rel="noreferrer" className="sidebar-link text-xs">🖼️ Illustrated Transformer</a>
            <a href="https://github.com/karpathy/nanoGPT" target="_blank" rel="noreferrer" className="sidebar-link text-xs">💻 nanoGPT</a>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 max-w-5xl mx-auto px-10 py-10">
        <Outlet />
      </main>

      {/* Right TOC */}
      <aside className="w-48 flex-shrink-0 border-l h-screen sticky top-0 overflow-y-auto hidden xl:block" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="p-4" key={location.pathname}>
          <TableOfContents />
        </div>
      </aside>
    </div>
  );
}