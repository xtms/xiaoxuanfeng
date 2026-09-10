import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
await page.addInitScript(() => {
  const readyP = Promise.resolve();
  try {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: readyP, check: () => true, load: () => readyP, addEventListener: () => {}, removeEventListener: () => {}, entries: () => [], keys: () => [], values: () => [], forEach: () => {}, size: 0 } });
  } catch (e) {}
});
page.on('pageerror', e => console.log('PAGE ERROR:', e));
await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.setItem('auth_loggedIn', 'true'); localStorage.setItem('auth_username', 'admin'); });
await page.goto('http://127.0.0.1:3200/mooncake', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.addStyleTag({ content: '*{animation:none !important;transition:none !important}' });
await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h4')];
  const h = heads.find(x => x.textContent.includes('4.6.2'));
  let el = h.nextElementSibling;
  while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
  if (el) el.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(500);
try {
  await page.screenshot({ path: '/tmp/live-462.png', timeout: 15000 });
  console.log('page shot ok');
} catch (e) { console.log('page shot fail:', e.message.split('\n')[0]); }
const dims = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h4')];
  const h = heads.find(x => x.textContent.includes('4.6.2'));
  let el = h.nextElementSibling;
  while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
  const svg = el.querySelector('svg');
  if (!svg) return null;
  return { viewBox: svg.getAttribute('viewBox'), w: Math.round(svg.getBoundingClientRect().width), h: Math.round(svg.getBoundingClientRect().height), containerW: Math.round(el.getBoundingClientRect().width), containerH: Math.round(el.getBoundingClientRect().height) };
});
console.log('svg dims:', JSON.stringify(dims));
await browser.close();
