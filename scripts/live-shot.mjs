import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(30000);
page.on('pageerror', e => console.log('PAGE ERROR:', e));
await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.setItem('auth_loggedIn', 'true'); localStorage.setItem('auth_username', 'admin'); });
await page.goto('http://127.0.0.1:3200/mooncake', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
// Disable animations to make element stable for screenshot
await page.addStyleTag({ content: '*{animation:none !important;transition:none !important}' });
const info = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h4')];
  const h = heads.find(x => x.textContent.includes('4.6.2'));
  let el = h.nextElementSibling;
  while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
console.log('container:', JSON.stringify(info));
if (info) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/live-462.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
  // Also capture svg dims
  const dims = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('h4')];
    const h = heads.find(x => x.textContent.includes('4.6.2'));
    let el = h.nextElementSibling;
    while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
    const svg = el.querySelector('svg');
    if (!svg) return null;
    const vb = svg.getAttribute('viewBox');
    const r = svg.getBoundingClientRect();
    return { viewBox: vb, w: Math.round(r.width), h: Math.round(r.height), containerW: Math.round(el.getBoundingClientRect().width) };
  });
  console.log('svg dims:', JSON.stringify(dims));
}
await browser.close();
