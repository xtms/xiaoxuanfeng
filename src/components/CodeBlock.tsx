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

export function Callout({ type, children }: { type: 'info' | 'warning' | 'tip' | 'danger'; children: React.ReactNode }) {
  const icons = { info: '💡', warning: '⚠️', tip: '✅', danger: '🚫' };
  const titles = { info: '信息', warning: '注意', tip: '提示', danger: '警告' };
  return (
    <div className={`callout callout-${type}`}>
      <div className="callout-title">{icons[type]} {titles[type]}</div>
      <div>{children}</div>
    </div>
  );
}

export function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="tag tag-accent no-underline" style={{ fontSize: '0.82rem' }}>
      {label} ↗
    </a>
  );
}

interface Resource {
  name: string;
  url: string;
  desc: string;
}

export function ResourceTable({ resources }: { resources: Resource[] }) {
  return (
    <table className="my-5">
      <thead>
        <tr>
          <th>资源名称</th>
          <th>链接</th>
          <th>说明</th>
        </tr>
      </thead>
      <tbody>
        {resources.map((r) => (
          <tr key={r.url}>
            <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.name}</td>
            <td>
              <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.82rem', wordBreak: 'break-all' }}>
                {r.url}
              </a>
            </td>
            <td style={{ fontSize: '0.85rem' }}>{r.desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}