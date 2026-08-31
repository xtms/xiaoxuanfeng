import TurndownService from 'turndown';
import html2pdf from 'html2pdf.js';
import { saveAs } from 'file-saver';

/**
 * 获取当前页面主内容区域的 DOM 元素
 */
function getMainContent(): HTMLElement | null {
  const main = document.querySelector('main');
  if (!main) return null;
  return main as HTMLElement;
}

/**
 * 克隆并清理 DOM 元素，为导出做准备
 * - 移除 Mermaid 的交互按钮
 * - 将 SVG 保留（PDF/DOCX 需要）
 */
function prepareContent(): HTMLElement | null {
  const main = getMainContent();
  if (!main) return null;

  const clone = main.cloneNode(true) as HTMLElement;

  // 移除 Mermaid 的交互按钮（箭头等）
  clone.querySelectorAll('.mermaid svg').forEach((svg) => {
    svg.removeAttribute('style');
    // 移除交互元素
    svg.querySelectorAll('g[class*="edgeLabel"], g[class*="arrowheadPath"]').forEach((el) => {
      // 保留这些，它们是有意义的
    });
  });

  // 移除空链接
  clone.querySelectorAll('a[href="#"]').forEach((a) => {
    const text = a.textContent || '';
    a.replaceWith(document.createTextNode(text));
  });

  return clone;
}

/**
 * 获取页面标题
 */
function getPageTitle(): string {
  const h1 = document.querySelector('main h1');
  if (h1) {
    return h1.textContent?.replace(/^[📖📊⚡🔌🧪🚀📋📚🔬📝🔍📖🎯💡🔧📌🎓🏗️]\s*/, '').trim() || '未命名';
  }
  return document.title || '未命名';
}

/**
 * 生成下载文件名
 */
function getFileName(ext: string): string {
  const title = getPageTitle();
  const date = new Date().toISOString().slice(0, 10);
  return `${title}_${date}.${ext}`;
}

// ============================================================
// MARKDOWN 导出
// ============================================================
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
});

// 自定义规则：将 Mermaid 图表转为代码块
turndownService.addRule('mermaid', {
  filter: (node) => {
    return node instanceof HTMLElement && node.classList.contains('mermaid-container');
  },
  replacement: (_content, node) => {
    const pre = (node as HTMLElement).querySelector('pre');
    if (pre) {
      return '\n```mermaid\n' + (pre.textContent || '') + '\n```\n';
    }
    return '\n*[图表]*\n';
  },
});

export function exportMarkdown() {
  const content = prepareContent();
  if (!content) return;

  const md = turndownService.turndown(content.innerHTML);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  saveAs(blob, getFileName('md'));
}

// ============================================================
// DOCX 导出（HTML 包装为 Word 兼容格式）
// ============================================================
export function exportDocx() {
  const content = prepareContent();
  if (!content) return;

  const title = getPageTitle();

  // 将 SVG 转为内联样式以保证 Word 中可见
  content.querySelectorAll('svg').forEach((svg) => {
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', 'auto');
  });

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
      <style>
        @page { margin: 2cm; }
        body { font-family: 'Microsoft YaHei', 'SimSun', sans-serif; font-size: 12pt; line-height: 1.8; color: #333; }
        h1 { font-size: 20pt; font-weight: bold; color: #1a1a1a; margin-bottom: 12pt; }
        h2 { font-size: 16pt; font-weight: bold; color: #1a1a1a; margin-bottom: 10pt; margin-top: 18pt; }
        h3 { font-size: 13pt; font-weight: bold; color: #333; margin-bottom: 8pt; margin-top: 14pt; }
        p { margin-bottom: 8pt; }
        pre { background: #f5f5f5; border: 1px solid #ddd; padding: 10pt; font-size: 9pt; font-family: 'Courier New', monospace; white-space: pre-wrap; border-radius: 4pt; }
        code { background: #f0f0f0; padding: 1pt 4pt; font-size: 9pt; font-family: 'Courier New', monospace; border-radius: 2pt; }
        img { max-width: 100%; height: auto; }
        figure { margin: 12pt 0; text-align: center; }
        figcaption { font-size: 10pt; color: #666; margin-top: 4pt; }
        table { border-collapse: collapse; width: 100%; margin: 10pt 0; }
        th, td { border: 1px solid #ddd; padding: 6pt 10pt; text-align: left; }
        th { background: #f0f0f0; font-weight: bold; }
        a { color: #0369a1; }
        blockquote { border-left: 3px solid #ccc; padding-left: 12pt; margin-left: 0; color: #555; }
        hr { border: none; border-top: 1px solid #ddd; margin: 16pt 0; }
        .callout { border-left: 4px solid #0284c7; background: #f0f7fe; padding: 10pt 14pt; margin: 10pt 0; border-radius: 4pt; }
        svg { max-width: 100%; }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      ${content.innerHTML}
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
  saveAs(blob, getFileName('doc'));
}

// ============================================================
// PDF 导出
// ============================================================
export async function exportPdf() {
  const content = prepareContent();
  if (!content) return;

  const title = getPageTitle();

  // 创建一个临时容器用于 PDF 渲染
  const container = document.createElement('div');
  container.style.cssText = 'padding: 20px; font-family: "Microsoft YaHei", "SimSun", sans-serif; color: #333; line-height: 1.8;';
  container.innerHTML = `<h1 style="font-size:22pt;margin-bottom:16pt;color:#1a1a1a;">${title}</h1>${content.innerHTML}`;

  // 将容器添加到 body（不可见）
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.background = '#fff';
  document.body.appendChild(container);

  try {
    const opt = {
      margin: [10, 10, 10, 10],
      filename: getFileName('pdf'),
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait' as const,
      },
    };

    await html2pdf().set(opt).from(container).save();
  } finally {
    document.body.removeChild(container);
  }
}