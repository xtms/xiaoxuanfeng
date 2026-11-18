import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);
await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.setItem('auth_loggedIn', 'true'); localStorage.setItem('auth_username', 'admin'); });
await page.goto('http://127.0.0.1:3200/mooncake', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const fonts = await page.evaluate(async () => {
  const out = [];
  if (document.fonts && document.fonts.ready) {
    try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]); } catch (e) {}
    for (const f of document.fonts) {
      out.push({ family: f.family, status: f.status, weight: f.weight });
    }
  }
  return out;
});
console.log('fonts:', JSON.stringify(fonts));
// check stylesheets for external fonts
const ext = await page.evaluate(() => {
  return [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.href);
});
console.log('css links:', JSON.stringify(ext));
await browser.close();
