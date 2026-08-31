import { articleData } from '../data/vllmQuickStart';

function renderTextWithLinks(text: string) {
  // Split text by reference markers like [1], [2], etc.
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const refMatch = part.match(/^\[(\d+)\]$/);
    if (refMatch) {
      const refNum = refMatch[1];
      const refLink = articleData.links.find(
        (l) => l.href.includes(`#ref_${refNum}`)
      );
      return refLink ? (
        <a
          key={i}
          href={refLink.href}
          className="text-blue-500 no-underline hover:underline text-xs align-super"
        >
          [{refNum}]
        </a>
      ) : (
        <span key={i}>{part}</span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function VLLMQuickStartPage() {
  let imageIndex = 0;

  return (
    <div className="prose max-w-none">
      {/* Title */}
      <h1 className="!text-2xl !font-bold !mb-2 !mt-0">
        {articleData.title}
      </h1>
      <div className="flex items-center gap-3 mb-6 text-sm" style={{ color: 'var(--text3)' }}>
        <span>📅 抓取时间: {new Date().toLocaleDateString('zh-CN')}</span>
        <a
          href="https://zhuanlan.zhihu.com/p/1984742841528902530"
          target="_blank"
          rel="noreferrer"
          className="text-blue-500 hover:underline"
        >
          🔗 知乎原文
        </a>
      </div>

      <hr style={{ borderColor: 'var(--border)' }} className="mb-8" />

      {/* Article content */}
      {articleData.paragraphs.map((p, i) => {
        // Handle figcaption - insert image before it
        if (p.tag === 'figcaption' && imageIndex < articleData.images.length) {
          const img = articleData.images[imageIndex++];
          return (
            <div key={i} className="my-6">
              <figure className="!m-0">
                <img
                  src={img.src}
                  alt={img.alt || p.text}
                  className="w-full rounded-lg shadow-md"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <figcaption className="text-center text-sm mt-2" style={{ color: 'var(--text3)' }}>
                  {p.text}
                </figcaption>
              </figure>
            </div>
          );
        }

        // Handle headings
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(p.tag)) {
          const level = parseInt(p.tag[1]);
          const sizes: Record<number, string> = { 1: '!text-xl', 2: '!text-lg', 3: '!text-base' };
          return (
            <div
              key={i}
              dangerouslySetInnerHTML={{ __html: `<${p.tag} class="${sizes[level] || '!text-base'} !font-bold !mt-8 !mb-4">${p.text}</${p.tag}>` }}
            />
          );
        }

        // Handle code blocks
        if (p.tag === 'pre') {
          return (
            <pre key={i} className="!bg-gray-900 !text-green-400 !p-4 !rounded-lg !overflow-x-auto !text-sm !my-4 !font-mono">
              <code>{p.text}</code>
            </pre>
          );
        }

        // Handle list items
        if (p.tag === 'li') {
          return (
            <li key={i} className="!ml-6 !list-disc !my-1">
              {renderTextWithLinks(p.text)}
            </li>
          );
        }

        // Handle blockquotes
        if (p.tag === 'blockquote') {
          return (
            <blockquote key={i} className="!border-l-4 !border-blue-400 !pl-4 !my-4 !italic" style={{ color: 'var(--text2)' }}>
              {renderTextWithLinks(p.text)}
            </blockquote>
          );
        }

        // Default paragraph
        return (
          <p key={i} className="!my-2 !leading-relaxed">
            {renderTextWithLinks(p.text)}
          </p>
        );
      })}

      {/* Remaining images */}
      {imageIndex < articleData.images.length && (
        <>
          <hr style={{ borderColor: 'var(--border)' }} className="!my-8" />
          <h2 className="!text-lg !font-bold !mb-4">🖼️ 更多图片</h2>
          <div className="grid grid-cols-2 gap-4">
            {articleData.images.slice(imageIndex).map((img, i) => (
              <figure key={i} className="!m-0">
                <img
                  src={img.src}
                  alt={img.alt || `图片 ${i + 1}`}
                  className="w-full rounded-lg shadow-md"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                {img.alt && (
                  <figcaption className="text-center text-xs mt-1" style={{ color: 'var(--text3)' }}>
                    {img.alt}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </>
      )}

      {/* Reference Links */}
      <hr style={{ borderColor: 'var(--border)' }} className="!my-8" />
      <h2 className="!text-lg !font-bold !mb-4">📎 参考链接</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {articleData.links
          .filter((l) => !l.href.includes('zhida.zhihu.com/search') && !l.href.includes('#ref_'))
          .map((link, i) => (
            <a
              key={i}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-500 hover:underline truncate block p-1 rounded hover:bg-blue-50"
              title={link.text}
            >
              {link.isExternal ? '🔗 ' : '📄 '}
              {link.text && link.text !== '(无文字)' ? link.text : link.href}
            </a>
          ))}
      </div>
    </div>
  );
}