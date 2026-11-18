import { Suspense, useLayoutEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TableOfContents } from './TableOfContents';
import { BackToTop } from './BackToTop';
import { LoadingSpinner } from './LoadingSpinner';
import { ExportButton } from './ExportButton';
import { Sidebar, SidebarTabButtons } from './Sidebar';
import { getTabForPath, findAncestorGroups, filterSidebar, llmSidebar, deepinferSidebar, autoDriveSidebar, type SidebarTab } from './sidebarData';

export function Layout() {
  const location = useLocation();

  // 折叠/展开状态：默认全部折叠
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ 'vLLM': true, 'KV Cache': true, 'KV Pool': true, '服务调度': true, '调度器': true, '训练框架': true, '模型可视化': true, 'DeepInfer 剖面': false, 'mini-DeepInfer 教学引擎': false, '十四课学习路径': false });

  // 左侧边栏和右侧目录栏的显隐状态
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [tocHidden, setTocHidden] = useState(false);

  // 侧边栏 Tab 切换：LLM推理框架 / DeepInfer 剖面 / 自动驾驶
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(getTabForPath(location.pathname));

  const currentSidebar = sidebarTab === 'llm' ? llmSidebar : sidebarTab === 'auto' ? autoDriveSidebar : deepinferSidebar;

  // 搜索过滤：命中时只显示匹配项及其祖先分组；搜索态下强制展开全部（有效 collapsed 为空对象）。
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const filteredSidebar = searching ? filterSidebar(currentSidebar, query) : currentSidebar;
  const effectiveCollapsed = searching ? {} : collapsed;

  // 当前激活链接的祖先分组（用于高亮“包含活跃子项”的分组）
  const activeGroups = findAncestorGroups(currentSidebar, location.pathname);

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // 路由切换时回到页面顶部（长文档站点：避免停留在新页面的旧滚动位置）。
  // 用 useLayoutEffect 在绘制前复位，防止闪一下旧位置；behavior:'instant' 跳过 smooth 动画。
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  // 路由变化时同步侧边栏 Tab（直接输入 URL 或站内跳转到其他区段时，菜单跟随当前页面），
  // 并自动展开激活链接所在的分组（只展开祖先，不强制收起用户手动折叠的分组）。
  // 用渲染期 state 调整（React 推荐的 props 变化同步模式）替代 effect 内同步 setState，避免级联渲染。
  // prevPath 初始为 ''，保证首次挂载（直接输入 URL 进深层页）也会执行一次展开。
  const [prevPath, setPrevPath] = useState('');
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    const tab = getTabForPath(location.pathname);
    setSidebarTab(tab);
    const items = tab === 'llm' ? llmSidebar : tab === 'auto' ? autoDriveSidebar : deepinferSidebar;
    const ancestors = findAncestorGroups(items, location.pathname);
    if (ancestors.length > 0) {
      setCollapsed((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const label of ancestors) {
          if (next[label] === true) {
            next[label] = false;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left Sidebar */}
      <aside className={`sidebar-panel ${sidebarHidden ? 'collapsed' : ''}`} style={{ background: 'var(--vp-sidebar-bg)', borderColor: 'var(--vp-sidebar-divider)' }}>
        <div className="sidebar-inner">
          {/* 站点标题 */}
          <div className="sidebar-brand">推理框架知识库</div>
          {/* Tab 切换 */}
          <div className="p-3 pt-1">
            <SidebarTabButtons tab={sidebarTab} onChange={setSidebarTab} />
            {/* 搜索框：过滤当前 Tab 的导航项 */}
            <input
              type="search"
              className="sidebar-search"
              placeholder="搜索页面…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜索侧边栏页面"
            />
          </div>
          <nav className="px-3 py-2 space-y-0.5 flex-1">
            <Sidebar
              items={filteredSidebar}
              collapsed={effectiveCollapsed}
              toggleGroup={toggleGroup}
              searchQuery={searching ? query : undefined}
              activeGroups={activeGroups}
            />
          </nav>
          {searching && filteredSidebar.length === 0 && (
            <div className="sidebar-empty">无匹配页面</div>
          )}
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
        {/* 导出工具栏 — 悬浮右上角、滚动时固定；data-export-exclude 保证导出时被剔除 */}
        <div className="export-toolbar" data-export-exclude>
          <ExportButton />
        </div>
        <Suspense fallback={<LoadingSpinner text="页面加载中..." />}>
          <Outlet />
        </Suspense>
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
