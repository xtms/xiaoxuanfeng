import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
page.on('pageerror', e => console.log('PAGE ERROR:', e));
await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.setItem('auth_loggedIn', 'true'); localStorage.setItem('auth_username', 'admin'); });
await page.goto('http://127.0.0.1:3200/mooncake', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.addStyleTag({ content: '*{animation:none !important;transition:none !important}' });
await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h4')];
  const h = heads.find(x => x.textContent.includes('4.6.2'));
  let el = h.nextElementSibling;
  while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
  if (el) el.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(600);
const dims = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h4')];
  const h = heads.find(x => x.textContent.includes('4.6.2'));
  let el = h.nextElementSibling;
  while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
  const svg = el.querySelector('svg');
  const c = el.getBoundingClientRect();
  return { viewBox: svg.getAttribute('viewBox'), svgW: Math.round(svg.getBoundingClientRect().width), svgH: Math.round(svg.getBoundingClientRect().height), cW: Math.round(c.width), cH: Math.round(c.height) };
});
console.log('dims:', JSON.stringify(dims));
try {
  await page.screenshot({ path: '/tmp/live-462.png', timeout: 20000 });
  console.log('shot OK');
} catch (e) { console.log('shot FAIL:', e.message.split('\n')[0]); }
await browser.close();
