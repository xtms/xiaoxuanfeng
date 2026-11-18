const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(30000);
  await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.setItem('auth_loggedIn', 'true'); localStorage.setItem('auth_username', 'admin'); });
  await page.goto('http://127.0.0.1:3200/mooncake', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const handle = await page.evaluateHandle(() => {
    const heads = [...document.querySelectorAll('h4')];
    const h = heads.find(x => x.textContent.includes('4.6.2'));
    let el = h.nextElementSibling;
    while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
    return el;
  });
  const el = handle.asElement();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await el.screenshot({ path: '/tmp/462-element.png' });
  await browser.close();
  console.log('done');
})();
