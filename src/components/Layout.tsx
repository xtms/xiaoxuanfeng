import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TableOfContents } from './TableOfContents';
import { BackToTop } from './BackToTop';
import { useAuth } from './AuthContext';

interface SidebarItem {
  to?: string;
  label: string;
  end?: boolean;
  external?: boolean;
  children?: SidebarItem[];
}

const llmSidebar: SidebarItem[] = [
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
      { to: '/router', label: 'AIBrix' },
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
  {
    label: '模型可视化',
    children: [
      { to: '/business-process', label: 'LLM 业务处理视图' },
      { to: '/inferflux/gpt-3d.html', label: 'GPT 架构 3D 透视', external: true },
      { to: '/model-structure-3d', label: 'MiMo-V2.5 模型结构 3D' },
      { to: '/transformer-explainer', label: 'Transformer Explainer (GPT-2)' },
      { to: '/inferflux/transformer-3d.html', label: 'Transformer + Speculative 3D', external: true },
      { to: '/inferflux/pd-disagg.html', label: 'PD 分离模拟器', external: true },
      { to: '/inferflux/vllm-pd-glm.html', label: 'vLLM P/D 分离模拟器', external: true },
    ],
  },
];

const autoDriveSidebar: SidebarItem[] = [
  { to: '/auto-drive', label: '首页', end: true },
  { to: '/auto-drive/overview', label: '总体架构' },
  {
    label: '训练框架',
    children: [
      { to: '/auto-drive/voyager', label: 'Voyager' },
      { to: '/auto-drive/drivevla-w0', label: 'DriveVLA-W0' },
      { to: '/auto-drive/emu3', label: 'Emu3' },
      { to: '/auto-drive/pi-0-5', label: 'Pi-0.5' },
      { to: '/auto-drive/pi0', label: 'π0' },
      { to: '/auto-drive/mtr', label: 'MTR' },
      { to: '/auto-drive/uniad', label: 'UniAD' },
      { to: '/auto-drive/cosmos-framework', label: 'Cosmos-Framework' },
    ],
  },
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

  if (item.external && item.to) {
    return (
      <a
        key={item.to}
        href={item.to}
        target="_blank"
        rel="noreferrer"
        className="sidebar-link sidebar-child-link"
      >
        {item.label}
      </a>
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
  const navigate = useNavigate();
  const { isLoggedIn, username, logout } = useAuth();

  // 折叠/展开状态：默认全部折叠
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ 'vLLM': true, '框架专题': true, 'KV Cache': true, 'KV Pool': true, 'Mooncake': true, '训练框架': true, '模型可视化': true });

  // 左侧边栏和右侧目录栏的显隐状态
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [tocHidden, setTocHidden] = useState(false);

  // 侧边栏 Tab 切换：LLM推理框架 / 自动驾驶
  const isAutoDrive = location.pathname.startsWith('/auto-drive');
  const [sidebarTab, setSidebarTab] = useState<'llm' | 'auto'>(isAutoDrive ? 'auto' : 'llm');

  const currentSidebar = sidebarTab === 'llm' ? llmSidebar : autoDriveSidebar;

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Sidebar */}
      <aside className={`sidebar-panel ${sidebarHidden ? 'collapsed' : ''}`} style={{ background: 'var(--vp-sidebar-bg)', borderColor: 'var(--vp-sidebar-divider)' }}>
        <div className="sidebar-inner">
          {/* Tab 切换 */}
          <div className="p-3" style={{ borderColor: 'var(--vp-sidebar-divider)' }}>
            <div style={{
              display: 'flex', background: 'var(--vp-c-bg)', borderRadius: 'var(--radius)',
              border: '1px solid var(--vp-c-divider)', overflow: 'hidden',
            }}>
              <button
                onClick={() => setSidebarTab('llm')}
                style={{
                  flex: 1, padding: '6px 0', fontSize: '0.8rem', fontWeight: sidebarTab === 'llm' ? 600 : 400,
                  color: sidebarTab === 'llm' ? '#fff' : 'var(--vp-c-text-2)',
                  background: sidebarTab === 'llm' ? 'var(--vp-c-brand)' : 'transparent',
                  border: 'none', cursor: 'pointer', borderRadius: sidebarTab === 'llm' ? 'calc(var(--radius) - 1px)' : 0,
                  transition: 'all 0.15s',
                }}
              >
                LLM 推理
              </button>
              <button
                onClick={() => setSidebarTab('auto')}
                style={{
                  flex: 1, padding: '6px 0', fontSize: '0.8rem', fontWeight: sidebarTab === 'auto' ? 600 : 400,
                  color: sidebarTab === 'auto' ? '#fff' : 'var(--vp-c-text-2)',
                  background: sidebarTab === 'auto' ? 'var(--vp-c-brand)' : 'transparent',
                  border: 'none', cursor: 'pointer', borderRadius: sidebarTab === 'auto' ? 'calc(var(--radius) - 1px)' : 0,
                  transition: 'all 0.15s',
                }}
              >
                自动驾驶
              </button>
            </div>
          </div>
          <nav className="px-3 py-3 space-y-0.5 flex-1">
            {currentSidebar.map((item) =>
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
          {isLoggedIn ? (
            <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--vp-sidebar-divider)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--vp-c-text-2)' }}>{username}</span>
              </div>
              <button
                onClick={() => { logout(); navigate('/'); }}
                style={{
                  width: '100%', padding: '5px 0',
                  fontSize: '0.78rem', fontWeight: 500,
                  color: 'var(--vp-c-text-2)',
                  background: 'none', border: '1px solid var(--vp-c-divider)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--vp-c-text-2)'; e.currentTarget.style.borderColor = 'var(--vp-c-divider)'; }}
              >
                退出登录
              </button>
            </div>
          ) : null}
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
      <main className="flex-1 min-w-0 max-w-4xl mx-auto px-12 py-12">
        <Outlet />
      </main>

      {/* Right TOC */}
      <aside className={`toc-panel ${tocHidden ? 'collapsed' : ''}`} style={{ background: 'var(--vp-c-bg)', borderColor: 'var(--vp-c-divider)' }}>
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