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
  {
    label: '框架专题',
    children: [
      {
        label: 'KV Cache',
        children: [
          { to: '/kv-cache', label: '概览' },
          { to: '/sglang-kv-cache', label: 'SGLang KV Cache 机制' },
          { to: '/vllm-kv-cache', label: 'vLLM KV Cache 机制' },
          { to: '/kv-cache-compare', label: 'SGLang vs vLLM 对比' },
        ],
      },
      {
        label: 'KV Pool',
        children: [
          { to: '/kv-pool', label: '概览' },
          { to: '/mooncake-kvpool', label: 'Mooncake KVPool' },
          { to: '/memcache', label: 'Ascend MemCache' },
        ],
      },
      { to: '/pd-separation', label: 'P/D 分离' },
      { to: '/serving-scheduler', label: '服务调度' },
      { to: '/router', label: '服务调度器' },
      {
        label: 'Mooncake',
        children: [
          { to: '/mooncake', label: '概览' },
          { to: '/mooncake-kvpool', label: 'KVPool (HIXL)' },
        ],
      },
    ],
  },
  { to: '/attention-close-reading', label: 'Attention (精读)' },
  { to: '/attention-en', label: 'Attention (论文-EN)' },
  { to: '/infratech', label: 'InfraTech' },
];

function SidebarItemRenderer({ item, collapsed, toggleGroup }: {
  item: SidebarItem;
  collapsed: Record<string, boolean>;
  toggleGroup: (label: string) => void;
}) {
  if (item.children) {
    return (
      <div className="mb-1">
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
              <SidebarItemRenderer
                key={child.to || child.label}
                item={child}
                collapsed={collapsed}
                toggleGroup={toggleGroup}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <NavLink key={item.to} to={item.to!} end={item.end} className={({ isActive }) =>
      `sidebar-link sidebar-child-link ${isActive ? 'active' : ''}`
    }>
      {item.label}
    </NavLink>
  );
}

export function Layout() {
  const location = useLocation();

  // 折叠/展开状态：默认全部折叠
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ 'vLLM': true, '框架专题': true, 'KV Cache': true, 'KV Pool': true, 'Mooncake': true });

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
                <SidebarItemRenderer
                  key={item.label}
                  item={item}
                  collapsed={collapsed}
                  toggleGroup={toggleGroup}
                />
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
            <p className="text-xs" style={{ color: 'var(--sidebar-group-text)' }}>LLM 推理框架</p>
            <p className="text-xs mt-1" style={{ color: 'var(--sidebar-text)' }}>学习指南</p>
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