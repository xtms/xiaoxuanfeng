import { useEffect, useState } from 'react';

interface TocItem {
  id: string;
  number: string;
  text: string;
  level: number;
}

function stripEmoji(text: string): string {
  return text.replace(/[\p{Emoji_Presentation}\p{Emoji}\u{200d}\u{fe0f}]/gu, '').trim();
}

export function TableOfContents() {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    const headings = main.querySelectorAll('h2, h3');
    const tocItems: TocItem[] = [];
    let h2Counter = 0;
    let h3Counter = 0;

    headings.forEach((h, i) => {
      const id = `toc-${i}`;
      h.id = id;
      const level = h.tagName === 'H2' ? 2 : 3;
      let number: string;

      if (level === 2) {
        h2Counter++;
        h3Counter = 0;
        number = String(h2Counter);
      } else {
        h3Counter++;
        number = `${h2Counter}.${h3Counter}`;
      }

      // Inject number prefix into heading if not already present
      if (!h.querySelector('[data-toc-number]')) {
        const span = document.createElement('span');
        span.setAttribute('data-toc-number', '');
        span.style.cssText = 'color:var(--text3);font-weight:400;margin-right:0.5em;';
        span.textContent = number + '. ';
        h.insertBefore(span, h.firstChild);
      }

      tocItems.push({
        id,
        number,
        text: stripEmoji(h.textContent || ''),
        level,
      });
    });
    setItems(tocItems);

    const observer = new IntersectionObserver(
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

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
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