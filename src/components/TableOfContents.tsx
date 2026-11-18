import { useEffect, useState } from 'react';

interface TocItem {
  id: string;
  number: string;
  text: string;
  level: number;
}

function stripEmoji(text: string): string {
  // 注意：\p{Emoji} 会命中 ASCII 数字（0-9 属于 Emoji 属性），会把 "0.1" 剥成 "."。
  // 改用 \p{Emoji_Presentation} + 变体选择符，只剥真正以 emoji 形式呈现的字符。
  return text.replace(/[\p{Emoji_Presentation}\u{200d}\u{fe0f}]/gu, '').trim();
}

export function TableOfContents() {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    let observer: IntersectionObserver | null = null;
    let lastSig = '';

    const buildToc = () => {
      const headings = main.querySelectorAll('h2, h3');
      // 标题集合未变化则跳过，避免 Mermaid SVG 等无关 DOM 变更反复重建
      const sig = Array.from(headings, (h) => `${h.tagName}:${h.textContent}`).join('|');
      if (sig === lastSig) return;
      lastSig = sig;

      const tocItems: TocItem[] = [];
      let h2Counter = 0;
      let h3Counter = 0;

      headings.forEach((h, i) => {
        const id = `toc-${i}`;
        h.id = id;
        const level = h.tagName === 'H2' ? 2 : 3;
        const raw = stripEmoji(h.textContent || '');

        // 页内标题自带编号前缀时，目录直接采用该编号，保证右侧目录与页面编号一一对应。
        // ① 复合编号（0.1 / 3.1 / 4.6.1…）；② 单级编号（1. / 2：…，限 1-2 位，避免误吞 "3D"/"2024"）
        const m = raw.match(/^(\d+(?:\.\d+)+)\s*[：:]?\s*(.*)$/)
          || raw.match(/^(\d{1,2})\s*[.、：:]\s*(.*)$/);
        let number: string;
        let text: string;

        if (m) {
          number = m[1];
          text = m[2] || '';
          // 用显式编号同步自动计数器：h2 "2." 之下的无编号 h3 应续为 "2.1 / 2.2"，
          // 而不是从头按 "0.1" 数。
          const parts = number.split('.');
          h2Counter = parseInt(parts[0], 10) || 0;
          h3Counter = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
        } else {
          if (level === 2) {
            h2Counter++;
            h3Counter = 0;
            number = String(h2Counter);
          } else {
            h3Counter++;
            number = `${h2Counter}.${h3Counter}`;
          }
          text = raw;
        }

        tocItems.push({
          id,
          number,
          text,
          level,
        });
      });
      setItems(tocItems);

      if (observer) observer.disconnect();
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveId(entry.target.id);
              break;
            }
          }
        },
        { rootMargin: '-80px 0px -80% 0px', threshold: 0 }
      );
      headings.forEach((h) => observer?.observe(h));
    };

    buildToc();

    // 路由懒加载：页面内容晚于 Layout 挂载，监听 main 子树变化，标题出现时重建目录
    const mo = new MutationObserver(() => buildToc());
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      observer?.disconnect();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <nav className="text-sm" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
      <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text3)' }}>目录</p>
      <ul className="space-y-0.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="block no-underline transition-colors py-1 border-l-2"
              style={{
                paddingLeft: item.level === 3 ? '18px' : '8px',
                fontSize: item.level === 3 ? '0.78rem' : '0.85rem',
                color: activeId === item.id ? 'var(--accent)' : 'var(--text2)',
                borderColor: activeId === item.id ? 'var(--accent)' : 'transparent',
                fontWeight: activeId === item.id ? 500 : 400,
              }}
            >
              <span style={{ color: 'var(--text3)', marginRight: 4 }}>{item.number}</span>
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}