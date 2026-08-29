import { useState, useCallback } from 'react';

interface Props {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, language, title }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback for older browsers or non-HTTPS
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  return (
    <div className="my-4">
      {title && (
        <div className="text-xs px-4 py-1.5 rounded-t-lg border border-b-0 flex items-center justify-between" style={{ background: 'var(--surface2)', borderColor: 'var(--border)', color: 'var(--text3)' }}>
          <span>{title}</span>
          <button onClick={handleCopy} className="text-xs transition-colors" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--accent)' : 'var(--text3)' }}>
            {copied ? '✓ 已复制' : '📋 复制'}
          </button>
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <pre style={title ? { borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: 0 } : {}}>
          {language && <div className="text-xs mb-2" style={{ color: 'var(--text3)' }}># {language}</div>}
          <code>{code}</code>
        </pre>
        {!title && (
          <button
            onClick={handleCopy}
            style={{
              position: 'absolute', top: 8, right: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 6, cursor: 'pointer', padding: '2px 8px',
              fontSize: '0.75rem', color: copied ? 'var(--accent)' : 'var(--text3)',
            }}
          >
            {copied ? '✓ 已复制' : '📋 复制'}
          </button>
        )}
      </div>
    </div>
  );
}

export function Callout({ type, children }: { type: 'info' | 'warning' | 'tip'; children: React.ReactNode }) {
  const colors = {
    info: { bg: 'rgba(99,102,241,0.1)', border: '#6366f1', icon: '💡' },
    warning: { bg: 'rgba(245,158,11,0.1)', border: '#f59e0b', icon: '⚠️' },
    tip: { bg: 'rgba(34,197,94,0.1)', border: '#22c55e', icon: '✅' },
  };
  const c = colors[type];
  return (
    <div className="my-4 p-4 rounded-lg" style={{ background: c.bg, borderLeft: `3px solid ${c.border}` }}>
      <div className="flex gap-2 items-start">
        <span>{c.icon}</span>
        <div className="text-sm" style={{ color: 'var(--text2)' }}>{children}</div>
      </div>
    </div>
  );
}

export function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="tag hover:text-white" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
      🔗 {label}
    </a>
  );
}