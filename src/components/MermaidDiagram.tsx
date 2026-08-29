import { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';

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

interface Props {
  chart: string;
  className?: string;
}

export function MermaidDiagram({ chart, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const id = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    mermaid.render(id.current, chart).then(({ svg }) => {
      if (svgWrapperRef.current) {
        svgWrapperRef.current.innerHTML = svg;
        const svgEl = svgWrapperRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = 'none';
          svgEl.style.height = 'auto';
        }
      }
      // Reset zoom/pan on new chart
      setScale(1);
      setPan({ x: 0, y: 0 });
    }).catch(console.error);
  }, [chart]);

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
    e.currentTarget.style.cursor = 'grabbing';
  }, [scale, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan({ x: e.clientX - lastPos.current.x, y: e.clientY - lastPos.current.y });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    dragging.current = false;
    e.currentTarget.style.cursor = scale > 1 ? 'grab' : 'default';
  }, [scale]);

  const zoomIn = () => setScale((s) => Math.min(5, s + 0.2));
  const zoomOut = () => setScale((s) => Math.max(0.2, s - 0.2));
  const zoomReset = () => { setScale(1); setPan({ x: 0, y: 0 }); };

  return (
    <div className={`mermaid-container ${className || ''}`} style={{ position: 'relative' }}>
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
        <div ref={svgWrapperRef} style={{ display: 'inline-block', minWidth: '100%' }} />
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