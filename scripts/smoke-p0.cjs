// P0/P1 验证脚本：懒加载、滚动复位、Mermaid 懒渲染、TOC 时序、PageHeader、导出按钮、导出下载
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const results = [];
  const check = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  };

  const BASE = 'http://localhost:3200';

  // 1. 首页直接公开访问（登录墙已移除）
  await page.goto(`${BASE}/`);
  await page.waitForSelector('.hero h1', { timeout: 8000 });
  const homeTitle = (await page.$eval('.hero h1', el => el.textContent)).trim();
  check('首页公开访问且懒加载渲染', homeTitle.includes('LLM 推理框架'), `h1="${homeTitle}"`);

  // 2. 无登录页、无鉴权跳转：/login 及未知路径应重定向到首页（避免空白页）
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(1200);
  const hasLoginForm = await page.$('input[type=password], .login-box, .auth-form');
  const redirectedHome = page.url().replace(/\/$/, '') === `${BASE}`;
  check('登录墙已移除（/login 重定向首页）', !hasLoginForm && redirectedHome, hasLoginForm ? '仍存在登录表单' : `URL → ${page.url()}`);

  // 3. vLLM 页懒加载渲染 + PageHeader 元信息
  await page.goto(`${BASE}/vllm`);
  await page.waitForSelector('main h1', { timeout: 8000 });
  const vllmH1 = (await page.$eval('main h1', el => el.textContent)).trim();
  check('vLLM 页懒加载渲染', vllmH1.includes('vLLM'), `h1="${vllmH1}"`);
  const metaCount = await page.$$eval('main .page-meta .page-meta-item', els => els.length);
  const metaText = await page.$eval('main .page-meta', el => el.textContent);
  check('PageHeader 元信息完整渲染', metaCount === 3 && metaText.includes('基于 releases/v0.23.0'), `page-meta项=${metaCount} 内容="${metaText.trim()}"`);

  // 4. 导出工具栏渲染（悬浮、data-export-exclude）
  const exportBtn = await page.$('.export-toolbar[data-export-exclude] .export-btn');
  check('导出工具栏渲染', !!exportBtn, exportBtn ? 'export-btn 已渲染' : '未找到 export-btn');

  // 5. TOC 在懒加载后正确填充（标题数量 > 0）
  await page.waitForTimeout(600);
  const tocCount = await page.$$eval('.toc-panel nav a', els => els.length);
  check('TOC 懒加载后填充', tocCount > 3, `目录项=${tocCount}`);

  // 6. 滚动复位：滚动到底部 → 切到 /overview → 应回到顶部
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const scrolled = await page.evaluate(() => window.scrollY);
  await page.goto(`${BASE}/overview`);
  await page.waitForSelector('main h1', { timeout: 8000 });
  await page.waitForTimeout(200);
  const scrollY = await page.evaluate(() => window.scrollY);
  check('路由切换滚动复位', scrolled > 500 && scrollY === 0, `切前scrollY=${Math.round(scrolled)} → 切后=${scrollY}`);

  // 7. Mermaid 懒渲染：首屏图渲染、折叠图未渲染
  await page.goto(`${BASE}/vllm`);
  await page.waitForSelector('main h1', { timeout: 8000 });
  await page.waitForTimeout(1500);
  const containerCount = await page.$$eval('.mermaid-container', els => els.length);
  const svgCountNearTop = await page.$$eval('.mermaid-container svg', els => els.length);
  check('Mermaid 首屏图已渲染', svgCountNearTop > 0, `首屏已渲染svg=${svgCountNearTop}`);
  check('Mermaid 首屏外图未提前渲染', svgCountNearTop < containerCount, `可见svg=${svgCountNearTop}（共${containerCount}个图，懒加载应少于${containerCount}）`);

  // 8. 滚动到页底触发其余图渲染
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.body.scrollHeight); });
  await page.waitForTimeout(6000);
  const svgCountAll = await page.$$eval('.mermaid-container svg', els => els.length);
  check('滚动后所有图完成渲染', svgCountAll === containerCount, `最终渲染svg=${svgCountAll}/${containerCount}`);

  // 9. Markdown 导出下载
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.click('.export-btn');
  await page.click('.export-menu button:nth-child(3)');
  try {
    const download = await downloadPromise;
    check('Markdown 导出产生文件', /\.md$/.test(download.suggestedFilename()), `filename="${download.suggestedFilename()}"`);
  } catch {
    check('Markdown 导出产生文件', false, 'download 事件超时');
  }

  await browser.close();

  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${failed === 0 ? '🎉 全部通过' : `⚠️ ${failed} 项失败`}（${results.length} 项）`);
  process.exit(failed === 0 ? 0 : 1);
})();
