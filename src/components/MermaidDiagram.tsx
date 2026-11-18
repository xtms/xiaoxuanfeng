import { useEffect, useRef, useState, useCallback, useId } from 'react';

interface Props {
  chart: string;
  className?: string;
  maxWidth?: number | string;
  /** 静态缩小比例（如 0.7 = 缩小 30%），作用于整张图并保留对应布局空间 */
  scale?: number;
}

let mermaidInitialized = false;

async function loadMermaid() {
  const mermaid = (await import('mermaid')).default;
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        primaryColor: '#eef2ff',
        primaryTextColor: '#1e293b',
        primaryBorderColor: '#4f46e5',
        lineColor: '#6366f1',
        secondaryColor: '#f1f5f9',
        tertiaryColor: '#f8fafc',
        background: '#ffffff',
        mainBkg: '#f1f5f9',
        nodeBorder: '#e2e8f0',
        clusterBkg: '#f8fafc',
        clusterBorder: '#e2e8f0',
        titleColor: '#1e293b',
        edgeLabelBackground: '#ffffff',
      },
    });
    mermaidInitialized = true;
  }
  return mermaid;
}

export function MermaidDiagram({ chart, className, maxWidth, scale: scaleProp }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  // 用 useId 替代 Math.random()（渲染期纯度），生成对 CSS/选择器安全的唯一 id
  const id = useRef(`mermaid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  // 是否已进入视口（懒渲染）：只有进入视口才开始加载并渲染图表
  const [inView, setInView] = useState(false);
  // 静态缩小：将 SVG 宽度直接设为 baseW×scale（mermaid 的 SVG width 属性是 "100%"，
  // 真实像素尺寸在 viewBox 里，故先用 100% 布局宽度作基准）
  const [shrunk, setShrunk] = useState(false);

  // 懒渲染：初始视口内立即渲染；滚动/缩放时对即将进入视口（预留 300px）的图渲染。
  // 相比纯 IntersectionObserver，还能覆盖瞬间跳转（Ctrl+End / URL 锚点跳页）时
  // 未渲染容器被直接跳过的场景。
  const maybeRender = useCallback(() => {
    if (!containerRef.current) return;
    if (containerRef.current.getBoundingClientRect().top < window.innerHeight + 300) {
      setInView(true);
    }
  }, []);

  useEffect(() => {
    maybeRender();
    window.addEventListener('scroll', maybeRender, { passive: true });
    window.addEventListener('resize', maybeRender, { passive: true });
    return () => {
      window.removeEventListener('scroll', maybeRender);
      window.removeEventListener('resize', maybeRender);
    };
  }, [maybeRender]);

  useEffect(() => {
    if (!inView || !containerRef.current) return;
    let cancelled = false;

    setLoading(true);

    loadMermaid().then((mermaid) => {
      if (cancelled) return;
      return mermaid.render(id.current, chart);
    }).then((result) => {
      if (cancelled || !result) return;
      if (svgWrapperRef.current) {
        // Use a document fragment to avoid interfering with React's virtual DOM
        const fragment = document.createRange().createContextualFragment(result.svg);
        // Clear any existing content first
        while (svgWrapperRef.current.firstChild) {
          svgWrapperRef.current.removeChild(svgWrapperRef.current.firstChild);
        }
        svgWrapperRef.current.appendChild(fragment);
        const svgEl = svgWrapperRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = 'none';
          svgEl.style.height = 'auto';
        }
        // 静态缩小：以当前 100% 布局宽度为基准，把 SVG 宽度覆盖为 baseW×scale
        if (svgEl && scaleProp && scaleProp !== 1) {
          const baseW = svgEl.getBoundingClientRect().width;
          if (baseW > 0) {
            svgEl.style.width = `${baseW * scaleProp}px`;
            svgEl.style.height = 'auto';
            setShrunk(true);
          } else {
            setShrunk(false);
          }
        } else {
          setShrunk(false);
        }
      }
      setScale(1);
      setPan({ x: 0, y: 0 });
      setLoading(false);
    }).catch((err) => {
      if (!cancelled) {
        console.error('Mermaid render error:', err);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [chart, scaleProp, inView]);

  const applyTransform = useCallback(() => {
    if (!svgWrapperRef.current) return;
    const svg = svgWrapperRef.current.querySelector('svg');
    if (!svg) return;
    svg.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
    svg.style.transformOrigin = '0 0';
  }, [scale, pan]);

  useEffect(() => {
    applyTransform();
  }, [scale, pan, applyTransform]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((s) => Math.max(0.2, Math.min(5, s + delta)));
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  }, [scale, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan({ x: e.clientX - lastPos.current.x, y: e.clientY - lastPos.current.y });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    dragging.current = false;
    (e.currentTarget as HTMLElement).style.cursor = scale > 1 ? 'grab' : 'default';
  }, [scale]);

  const zoomIn = () => setScale((s) => Math.min(5, s + 0.2));
  const zoomOut = () => setScale((s) => Math.max(0.2, s - 0.2));
  const zoomReset = () => { setScale(1); setPan({ x: 0, y: 0 }); };

  return (
    <div className={`mermaid-container ${className || ''}`} style={{ position: 'relative', maxWidth: maxWidth || 'none' }}>
      {/* Controls */}
      <div style={{
        position: 'absolute', top: 8, right: 8, zIndex: 10,
        display: 'flex', gap: 2, opacity: 0, transition: 'opacity 0.2s',
      }} className="mermaid-controls">
        <button onClick={zoomIn} title="放大 (Ctrl+滚轮)" style={btnStyle}>+</button>
        <button onClick={zoomOut} title="缩小 (Ctrl+滚轮)" style={btnStyle}>−</button>
        <button onClick={zoomReset} title="重置" style={{ ...btnStyle, fontSize: '0.7rem' }}>⟲</button>
      </div>

      {/* Scrollable/draggable viewport */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          overflow: 'auto',
          maxHeight: scale > 1 ? '70vh' : 'none',
          cursor: scale > 1 ? 'grab' : 'default',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          margin: '20px 0',
        }}
      >
        <div ref={svgWrapperRef} style={{
          display: shrunk ? 'flex' : 'inline-block',
          justifyContent: shrunk ? 'center' : undefined,
          alignItems: shrunk ? 'flex-start' : undefined,
          minWidth: '100%',
        }} />
        {loading && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '40px 0', color: 'var(--text3)', fontSize: '0.88rem',
          }}>
            ⏳ 加载图表...
          </div>
        )}
      </div>

      <style>{`
        .mermaid-container:hover .mermaid-controls { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 28, height: 28,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text2)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1rem',
  lineHeight: 1,
  padding: 0,
};