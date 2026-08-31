import { useState, useRef, useEffect } from 'react';
import { exportMarkdown, exportDocx, exportPdf } from '../utils/export';

export function ExportButton() {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | 'md' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = async (type: 'pdf' | 'docx' | 'md') => {
    setExporting(type);
    setOpen(false);
    try {
      if (type === 'pdf') {
        await exportPdf();
      } else if (type === 'docx') {
        exportDocx();
      } else {
        exportMarkdown();
      }
    } catch (err) {
      console.error(`导出 ${type} 失败:`, err);
    } finally {
      setExporting(null);
    }
  };

  const items = [
    { type: 'pdf' as const, label: '导出 PDF', icon: '📄' },
    { type: 'docx' as const, label: '导出 Word', icon: '📝' },
    { type: 'md' as const, label: '导出 Markdown', icon: '📋' },
  ];

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        className="export-btn"
        title="导出页面"
        disabled={exporting !== null}
      >
        {exporting ? '⏳' : '📥'}
        <span className="export-btn-text">导出</span>
        <span className="export-chevron">▾</span>
      </button>

      {open && (
        <div className="export-menu">
          {items.map((item) => (
            <button
              key={item.type}
              onClick={() => handleExport(item.type)}
              className="export-menu-item"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}