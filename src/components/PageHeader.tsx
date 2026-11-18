/**
 * 页面页头 — 统一 h1 + 元信息（日期/阅读时长/标签/附加项）样板。
 * 集中管理后，各页面只需一行 <PageHeader />，改日期/标签一处生效，避免跨页面手写重复。
 */

interface MetaItem {
  icon: string;
  text: string;
}

interface PageHeaderProps {
  title: string;
  /** 日期文本，如 "更新于 2026-09" 或 "基于 releases/v0.23.0" */
  date?: string;
  /** 阅读时长文本，如 "阅读约 30 分钟" */
  readingTime?: string;
  /** 标签列表，渲染为 "🏷️ a · b · c" */
  tags?: string[];
  /** 附加元数据项，如 📖 源码分析 */
  extra?: MetaItem[];
}

export function PageHeader({ title, date, readingTime, tags, extra }: PageHeaderProps) {
  return (
    <>
      <h1>{title}</h1>
      <div className="page-meta">
        {date && <span className="page-meta-item">📅 {date}</span>}
        {readingTime && <span className="page-meta-item">⏱️ {readingTime}</span>}
        {tags && tags.length > 0 && <span className="page-meta-item">🏷️ {tags.join(' · ')}</span>}
        {extra?.map((item, i) => (
          <span key={i} className="page-meta-item">{item.icon} {item.text}</span>
        ))}
      </div>
    </>
  );
}
