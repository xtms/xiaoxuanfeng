import { useRef } from 'react';

interface VisualizerPageProps {
  title: string;
  src: string;
  desc?: string;
  tags?: string[];
  hint?: string;
}

/**
 * 通用可视化页面 — 将 public/inferflux/ 下独立可运行的 HTML 可视化模块
 * 以 iframe 嵌入到应用内，作为内部路由页面展示（替代"新标签页打开"）。
 * 适用于 3D 模型结构、Transformer 内部机制、推理流程模拟器等交互可视化。
 * 支持全屏播放与新标签页打开完整版。
 */
export function VisualizerPage({ title, src, desc, tags = [], hint }: VisualizerPageProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  const toggleFullscreen = () => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div className="prose max-w-none">
      <h1>{title}</h1>
      <div className="page-meta">
        <span className="page-meta-item">📅 更新于 2026-09</span>
        {tags.length > 0 && (
          <span className="page-meta-item">🏷️ {tags.join(' · ')}</span>
        )}
      </div>
      {desc && <p>{desc}</p>}
      {hint && (
        <p style={{ color: 'var(--vp-c-text-3)', fontSize: '0.9rem', marginTop: -6 }}>
          💡 {hint}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' }}>
        <button className="export-btn" onClick={toggleFullscreen}>
          ⛶ 全屏
        </button>
        <a className="export-btn" href={src} target="_blank" rel="noreferrer">
          ↗ 新标签页打开
        </a>
      </div>
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden', borderRadius: 'var(--radius)' }}>
        <iframe
          ref={frameRef}
          src={src}
          title={title}
          style={{
            display: 'block',
            width: '100%',
            height: 'calc(100vh - 260px)',
            minHeight: 520,
            border: 'none',
            background: '#1a2333',
          }}
        />
      </div>
    </div>
  );
}
