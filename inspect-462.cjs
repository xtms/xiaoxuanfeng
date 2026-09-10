const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.setItem('auth_loggedIn', 'true'); localStorage.setItem('auth_username', 'admin'); });
  await page.goto('http://127.0.0.1:3200/mooncake', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Measure each node: text vs box overflow
  const nodes = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('h4')];
    const h = heads.find(x => x.textContent.includes('4.6.2'));
    let el = h.nextElementSibling;
    while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
    const svg = el.querySelector('svg');
    const results = [];
    const nodeEls = svg.querySelectorAll('.node');
    for (const n of nodeEls) {
      const rect = n.querySelector('rect');
      const label = n.querySelector('.label');
      if (!rect || !label) continue;
      const r = rect.getBoundingClientRect();
      const txt = label.getBoundingClientRect();
      const txtContent = (label.textContent || '').replace(/\s+/g, ' ').slice(0, 90);
      const overflowX = txt.width > r.width + 1;
      const overflowY = txt.height > r.height + 1;
      const textOutside = txt.right > r.right + 1 || txt.bottom > r.bottom + 1 || txt.left < r.left - 1 || txt.top < r.top - 1;
      if (overflowX || overflowY || textOutside) {
        results.push({ id: n.id, txt: txtContent,
          box: { w: Math.round(r.width), h: Math.round(r.height) },
          text: { w: Math.round(txt.width), h: Math.round(txt.height) },
          overflowX, overflowY, textOutside,
          boxR: { l: Math.round(r.left), t: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) },
          textR: { l: Math.round(txt.left), t: Math.round(txt.top), right: Math.round(txt.right), bottom: Math.round(txt.bottom) } });
      }
    }
    return results;
  });
  console.log('OVERFLOW NODES:', JSON.stringify(nodes, null, 2));

  // Screenshot just the 4.6.2 container element
  const shot = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('h4')];
    const h = heads.find(x => x.textContent.includes('4.6.2'));
    let el = h.nextElementSibling;
    while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
    el.scrollIntoView({ block: 'start' });
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/462-element.png', clip: { x: shot.x, y: shot.y, width: Math.min(shot.w, 1200), height: Math.min(shot.h, 2000) } });
  console.log('SHOT:', JSON.stringify(shot));
  console.log('ERRORS:', errors.length ? errors.slice(0,3) : 'none');
  await browser.close();
})();
