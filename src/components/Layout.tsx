import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { TableOfContents } from './TableOfContents';
import { ExportButton } from './ExportButton';
import { BackToTop } from './BackToTop';

interface SidebarItem {
  to?: string;
  label: string;
  end?: boolean;
  children?: SidebarItem[];
}

const sidebar: SidebarItem[] = [
  { to: '/', label: '首页', end: true },
  { to: '/overview', label: '总体架构' },
  {
    label: 'vLLM',
    children: [
      { to: '/vllm', label: 'vLLM' },
      { to: '/vllm-arch', label: 'vLLM Arch' },
      { to: '/vllm-quickstart', label: 'vLLM 快速入门' },
    ],
  },
  { to: '/vllm-ascend', label: 'vLLM-Ascend' },
  { to: '/nano-vllm', label: 'nano-vLLM-NPU' },
  { to: '/sglang', label: 'SGLang' },
  { to: '/comparison', label: '框架对比' },
  { to: '/attention-close-reading', label: 'Attention (精读)' },
  { to: '/attention-en', label: 'Attention (论文-EN)' },
  { to: '/infratech', label: 'InfraTech' },
];

export function Layout() {
  const location = useLocation();

  // 折叠/展开状态：默认全部折叠
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ 'vLLM': true });

  // 左侧边栏和右侧目录栏的显隐状态
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [tocHidden, setTocHidden] = useState(false);

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Sidebar */}
      <aside className={`sidebar-panel ${sidebarHidden ? 'collapsed' : ''}`} style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}>
        <div className="sidebar-inner">
          <div className="p-5 border-b" style={{ borderColor: 'var(--sidebar-divider)' }}>
            <a href="/" className="text-base font-bold no-underline gradient-text">LLM 推理框架</a>
            <p className="text-xs mt-1" style={{ color: 'var(--sidebar-text)' }}>学习指南</p>
          </div>
          <nav className="px-3 py-3 space-y-0.5 flex-1">
            {sidebar.map((item) =>
              item.children ? (
                <div key={item.label} className="mb-1">
                  <button
                    onClick={() => toggleGroup(item.label)}
                    className="sidebar-group"
                  >
                    <span className={`sidebar-chevron ${collapsed[item.label] ? 'collapsed' : ''}`}>▾</span>
                    {item.label}
                  </button>
                  <div className={`sidebar-sub ${collapsed[item.label] ? 'collapsed' : ''}`}>
                    <div className="sidebar-children">
                      {item.children.map((child) => (
                        <NavLink key={child.to} to={child.to!} end={child.end} className={({ isActive }) =>
                          `sidebar-link sidebar-child-link ${isActive ? 'active' : ''}`
                        }>
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <NavLink key={item.to} to={item.to!} end={item.end} className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'active' : ''}`
                }>
                  {item.label}
                </NavLink>
              )
            )}
          </nav>
          <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--sidebar-divider)' }}>
            <p className="text-xs" style={{ color: 'var(--sidebar-group-text)' }}>外部资源</p>
            <div className="mt-2 space-y-1">
              <a href="https://github.com/vllm-project/vllm" target="_blank" rel="noreferrer" className="sidebar-link text-xs">vLLM GitHub</a>
              <a href="https://github.com/vllm-project/vllm-ascend" target="_blank" rel="noreferrer" className="sidebar-link text-xs">vLLM-Ascend</a>
              <a href="https://github.com/xtms/nano-vllm-npu" target="_blank" rel="noreferrer" className="sidebar-link text-xs">nano-vLLM</a>
              <a href="https://github.com/sgl-project/sglang" target="_blank" rel="noreferrer" className="sidebar-link text-xs">SGLang GitHub</a>
              <a href="https://arxiv.org/abs/1706.03762" target="_blank" rel="noreferrer" className="sidebar-link text-xs">Transformer 论文</a>
              <a href="https://jalammar.github.io/illustrated-transformer/" target="_blank" rel="noreferrer" className="sidebar-link text-xs">Illustrated Transformer</a>
              <a href="https://github.com/karpathy/nanoGPT" target="_blank" rel="noreferrer" className="sidebar-link text-xs">nanoGPT</a>
            </div>
          </div>
        </div>
        <button
          onClick={() => setSidebarHidden(!sidebarHidden)}
          className="sidebar-toggle-btn"
          title={sidebarHidden ? '展开侧边栏' : '收起侧边栏'}
        >
          {sidebarHidden ? '▶' : '◀'}
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 max-w-5xl mx-10 px-12 py-12">
        <div className="flex justify-end mb-2">
          <ExportButton />
        </div>
        <Outlet />
      </main>

      {/* Right TOC */}
      <aside className={`toc-panel ${tocHidden ? 'collapsed' : ''}`} style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="toc-inner">
          <div className="p-4" key={location.pathname}>
            <TableOfContents />
          </div>
        </div>
        <button
          onClick={() => setTocHidden(!tocHidden)}
          className={`toc-toggle-btn ${tocHidden ? 'fixed-right' : ''}`}
          title={tocHidden ? '展开目录' : '收起目录'}
        >
          {tocHidden ? '◀' : '▶'}
        </button>
      </aside>

      <BackToTop />
    </div>
  );
}