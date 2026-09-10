import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.setItem('auth_loggedIn', 'true'); localStorage.setItem('auth_username', 'admin'); });
await page.goto('http://127.0.0.1:3200/mooncake', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.addStyleTag({ content: '*{animation:none !important;transition:none !important}' });

// Measure every node: node element box vs its .label box
const nodes = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h4')];
  const h = heads.find(x => x.textContent.includes('4.6.2'));
  let el = h.nextElementSibling;
  while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
  const svg = el.querySelector('svg');
  const results = [];
  for (const n of svg.querySelectorAll('.node')) {
    const label = n.querySelector('.label');
    if (!label) continue;
    const r = n.getBoundingClientRect();
    const txt = label.getBoundingClientRect();
    const txtContent = (label.textContent || '').replace(/\s+/g, ' ').slice(0, 100);
    const overX = txt.width > r.width + 1;
    const overY = txt.height > r.height + 1;
    const outside = txt.right > r.right + 1 || txt.bottom > r.bottom + 1 || txt.left < r.left - 1 || txt.top < r.top - 1;
    const txtLines = [...label.querySelectorAll('div,span')].filter(x => x.children.length === 0).length;
    results.push({
      id: n.id, txt: txtContent,
      box: { w: Math.round(r.width), h: Math.round(r.height) },
      text: { w: Math.round(txt.width), h: Math.round(txt.height) },
      overX, overY, outside, txtLines,
      txtR: { l: Math.round(txt.left), t: Math.round(txt.top), right: Math.round(txt.right), bottom: Math.round(txt.bottom) },
      boxR: { l: Math.round(r.left), t: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) },
    });
  }
  return results;
});
console.log('NODE MEASUREMENTS:');
for (const n of nodes) {
  const flag = (n.overX || n.overY || n.outside) ? ' <<< OVERFLOW' : '';
  console.log(`  ${n.id.split('-').slice(-2).join('-').padEnd(14)} box=${JSON.stringify(n.box)} text=${JSON.stringify(n.text)} lines=${n.txtLines}${flag}  "${n.txt}"`);
}
console.log('ERRORS:', errors.length ? errors.slice(0, 3) : 'none');

// Screenshot: scroll section into view, screenshot full viewport
await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h4')];
  const h = heads.find(x => x.textContent.includes('4.6.2'));
  let el = h.nextElementSibling;
  while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
  el.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/462-section.png' });
console.log('screenshot saved: /tmp/462-section.png');
await browser.close();
