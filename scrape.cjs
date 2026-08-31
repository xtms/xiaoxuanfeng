/**
 * 知乎专栏文章抓取器 - 基于 Playwright + Stealth
 * 用法: node scrape.js
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

chromium.use(StealthPlugin());

const URL = 'https://zhuanlan.zhihu.com/p/1984742841528902530';
const OUTPUT_DIR = path.join(__dirname, 'output');
const ARTICLE_ID = '1984742841528902530';

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('='.repeat(60));
  console.log('知乎文章抓取器 (Stealth Mode)');
  console.log('='.repeat(60));
  console.log(`目标: ${URL}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });

  await context.addInitScript(() => {
    window.chrome = { runtime: {}, loadTimes: function () {}, csi: function () {}, app: {} };
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  });

  const page = await context.newPage();

  try {
    // Step 1: Visit homepage first
    console.log('[1/5] 建立会话...');
    await page.goto('https://zhuanlan.zhihu.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    console.log('  ✓ 完成');

    // Step 2: Open target article
    console.log('[2/5] 打开文章...');
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    const pageTitle = await page.title();
    console.log(`  标题: ${pageTitle}`);

    if (pageTitle.includes('安全验证')) {
      console.log('  ⚠ 触发验证，等待...');
      await page.waitForTimeout(10000);
    }

    // Step 3: Wait for content
    console.log('[3/5] 等待渲染...');
    let articleLoaded = false;
    const selectors = ['.Post-RichText', '.RichText', 'article .RichText', '.Post-content', '[class*="RichText"]'];
    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        console.log(`  ✓ 容器: ${sel}`);
        articleLoaded = true;
        break;
      } catch {}
    }
    if (!articleLoaded) {
      await page.waitForTimeout(5000);
      console.log('  ⚠ 使用通用提取');
    }
    await page.waitForTimeout(3000);

    // Scroll to trigger lazy loading
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let h = 0;
        const t = setInterval(() => { h += 200; window.scrollBy(0, 200); if (h >= document.body.scrollHeight) { clearInterval(t); resolve(); } }, 150);
      });
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2000);

    // Step 4: Extract content
    console.log('[4/5] 提取内容...');
    const articleData = await page.evaluate(() => {
      // Title
      let title = '';
      const titleEl = document.querySelector('.Post-Title, .Article-title, h1.Post-Title, h1');
      if (titleEl) title = titleEl.textContent.trim();
      if (!title) {
        const t = document.querySelector('title');
        if (t) title = t.textContent.replace(' - 知乎', '').trim();
      }

      // Content
      const contentSelectors = ['.Post-RichText', '.RichText', 'article .RichText', '.Post-content', '[class*="RichText"]'];
      let contentEl = null;
      for (const sel of contentSelectors) {
        contentEl = document.querySelector(sel);
        if (contentEl) break;
      }

      const paragraphs = [];
      if (contentEl) {
        const nodes = contentEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, figure > figcaption, figure figcaption, span.figcaption_text, [class*="caption"]');
        nodes.forEach((node) => {
          const tag = node.tagName.toLowerCase();
          const text = node.textContent.trim();
          if (text && text.length > 1) paragraphs.push({ tag: tag === 'span' ? 'figcaption' : tag, text });
        });
        if (paragraphs.length === 0 && contentEl.textContent.trim()) {
          paragraphs.push({ tag: 'section', text: contentEl.textContent.trim() });
        }
      }

      // Images
      const images = [];
      const imgs = contentEl ? contentEl.querySelectorAll('img') : document.querySelectorAll('img');
      imgs.forEach((img) => {
        const src = img.getAttribute('data-src') || img.getAttribute('data-original') || img.src;
        const alt = img.getAttribute('alt') || '';
        if (src && !src.includes('avatar') && !src.includes('icon') && !src.includes('data:image/')) {
          images.push({ src, alt, width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 });
        }
      });

      // Links
      const links = [];
      const anchors = contentEl ? contentEl.querySelectorAll('a[href]') : document.querySelectorAll('a[href]');
      const seen = new Set();
      anchors.forEach((a) => {
        const href = a.href;
        const text = a.textContent.trim();
        if (href && !seen.has(href) && !href.startsWith('javascript:') && !href.startsWith('#')) {
          seen.add(href);
          links.push({ href, text: text || '(无文字)', isExternal: !href.includes('zhihu.com') });
        }
      });

      return { title, paragraphs, images, links };
    });

    console.log(`  ✓ 标题: ${articleData.title}`);
    console.log(`  ✓ 段落: ${articleData.paragraphs.length}`);
    console.log(`  ✓ 图片: ${articleData.images.length}`);
    console.log(`  ✓ 链接: ${articleData.links.length}`);

    // Step 5: Save
    console.log('[5/5] 保存结果...');
    const jsonPath = path.join(OUTPUT_DIR, `${ARTICLE_ID}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(articleData, null, 2), 'utf-8');
    console.log(`  ✓ JSON: ${jsonPath}`);

    // Screenshot
    const screenshotPath = path.join(OUTPUT_DIR, `${ARTICLE_ID}_screenshot.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  ✓ 截图: ${screenshotPath}`);

    console.log('\n抓取完成!');
    return articleData;
  } catch (err) {
    console.error(`❌ 错误: ${err.message}`);
    try {
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${ARTICLE_ID}_error.png`), fullPage: true });
    } catch {}
  } finally {
    await browser.close();
    console.log('浏览器已关闭');
  }
}

main().catch((err) => { console.error('失败:', err); process.exit(1); });