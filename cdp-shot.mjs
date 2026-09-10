import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);
page.on('pageerror', e => console.log('PAGE ERROR:', e));
await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.setItem('auth_loggedIn', 'true'); localStorage.setItem('auth_username', 'admin'); });
await page.goto('http://127.0.0.1:3200/mooncake', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.addStyleTag({ content: '*{animation:none !important;transition:none !important}' });
// Scroll the 4.6.2 container into view
await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h4')];
  const h = heads.find(x => x.textContent.includes('4.6.2'));
  let el = h.nextElementSibling;
  while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
  if (el) el.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(500);
const clip = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h4')];
  const h = heads.find(x => x.textContent.includes('4.6.2'));
  let el = h.nextElementSibling;
  while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, vw), height: Math.min(r.height, vh) };
});
console.log('clip:', JSON.stringify(clip));
const cdp = await page.context().newCDPSession(page);
const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: false });
writeFileSync('/tmp/live-462.png', Buffer.from(shot.data, 'base64'));
// svg dims
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
