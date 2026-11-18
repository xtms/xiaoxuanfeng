import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { SidebarItem, SidebarTab } from './sidebarData';

/** 高亮命中关键字片段（区分大小写不敏感）。 */
function highlightText(text: string, query?: string): ReactNode {
  const q = query?.trim().toLowerCase();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="sidebar-match">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function ItemIcon({ icon }: { icon?: string }) {
  if (!icon) return null;
  return <span className="sidebar-icon">{icon}</span>;
}

function SidebarItemRenderer({ item, collapsed, toggleGroup, searchQuery, activeGroups }: {
  item: SidebarItem;
  collapsed: Record<string, boolean>;
  toggleGroup: (label: string) => void;
  searchQuery?: string;
  activeGroups?: string[];
}) {
  if (item.children) {
    const isActiveParent = activeGroups?.includes(item.label);
    return (
      <div className="mb-1">
        {item.to ? (
          // 分组本身可点击：标签跳转目标页，▾ 负责展开/折叠（如 mini-DeepInfer 教学引擎 → /deepinfer/mini）
          <div className={`sidebar-group ${isActiveParent ? 'active-parent' : ''}`} onClick={() => toggleGroup(item.label)}>
            <span className={`sidebar-chevron ${collapsed[item.label] ? 'collapsed' : ''}`}>▾</span>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={(e) => e.stopPropagation()}
              className={({ isActive }) => `sidebar-group-label ${isActive ? 'active' : ''}`}
            >
              <ItemIcon icon={item.icon} />
              {highlightText(item.label, searchQuery)}
            </NavLink>
          </div>
        ) : (
          <button
            onClick={() => toggleGroup(item.label)}
            className={`sidebar-group ${isActiveParent ? 'active-parent' : ''}`}
          >
            <span className={`sidebar-chevron ${collapsed[item.label] ? 'collapsed' : ''}`}>▾</span>
            <ItemIcon icon={item.icon} />
            {highlightText(item.label, searchQuery)}
          </button>
        )}
        <div className={`sidebar-sub ${collapsed[item.label] ? 'collapsed' : ''}`}>
          <div className="sidebar-children">
            {item.children.map((child) => (
              <SidebarItemRenderer
                key={child.to || child.label}
                item={child}
                collapsed={collapsed}
                toggleGroup={toggleGroup}
                searchQuery={searchQuery}
                activeGroups={activeGroups}
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
        title="在新标签页打开"
      >
        {highlightText(item.label, searchQuery)} <span style={{ fontSize: '0.72em', opacity: 0.55 }}>↗</span>
      </a>
    );
  }

  return (
    <NavLink key={item.to} to={item.to!} end={item.end} className={({ isActive }) =>
      `sidebar-link sidebar-child-link ${isActive ? 'active' : ''}`
    }>
      <ItemIcon icon={item.icon} />
      {highlightText(item.label, searchQuery)}
    </NavLink>
  );
}

/** 侧边栏内容：渲染当前 Tab 的菜单项，递归处理分组。 */
export function Sidebar({ items, collapsed, toggleGroup, searchQuery, activeGroups }: {
  items: SidebarItem[];
  collapsed: Record<string, boolean>;
  toggleGroup: (label: string) => void;
  searchQuery?: string;
  activeGroups?: string[];
}) {
  return (
    <>
      {items.map((item) =>
        item.children ? (
          <SidebarItemRenderer
            key={item.label}
            item={item}
            collapsed={collapsed}
            toggleGroup={toggleGroup}
            searchQuery={searchQuery}
            activeGroups={activeGroups}
          />
        ) : (
          <NavLink key={item.to} to={item.to!} end={item.end} className={({ isActive }) =>
            `sidebar-link ${isActive ? 'active' : ''}`
          }>
            <ItemIcon icon={item.icon} />
            {highlightText(item.label, searchQuery)}
          </NavLink>
        )
      )}
    </>
  );
}

/** 顶部模块 Tab：等宽 + 间距 + 独立圆角 + hover 反馈，活跃项品牌色底。 */
export function SidebarTabButtons({ tab, onChange }: {
  tab: SidebarTab;
  onChange: (t: SidebarTab) => void;
}) {
  const tabs: { key: SidebarTab; label: string }[] = [
    { key: 'llm', label: 'LLM 推理' },
    { key: 'deepinfer', label: 'DeepInfer' },
    { key: 'auto', label: '自动驾驶' },
  ];
  return (
    <div className="sidebar-tabs">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`sidebar-tab ${tab === key ? 'active' : ''}`}
          aria-pressed={tab === key}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
