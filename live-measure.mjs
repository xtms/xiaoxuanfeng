import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.setItem('auth_loggedIn', 'true'); localStorage.setItem('auth_username', 'admin'); });
await page.goto('http://127.0.0.1:3200/mooncake', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const result = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h4')];
  const h = heads.find(x => x.textContent.includes('4.6.2'));
  let el = h.nextElementSibling;
  while (el && !el.classList.contains('mermaid-container')) el = el.nextElementSibling;
  const svg = el.querySelector('svg');
  const all = [];
  const problem = [];
  for (const n of svg.querySelectorAll('.node')) {
    const label = n.querySelector('.label');
    if (!label) continue;
    const labelR = label.getBoundingClientRect();
    const shapeEl = n.querySelector(':scope > rect, :scope > ellipse, :scope > polygon, :scope > path');
    const shapeR = shapeEl ? shapeEl.getBoundingClientRect() : null;
    const txtContent = (label.textContent || '').replace(/\s+/g, ' ').slice(0, 90);
    if (!shapeR) { problem.push({ id: n.id, txt: txtContent, note: 'no shape' }); continue; }
    const outside = labelR.right > shapeR.right + 1 || labelR.bottom > shapeR.bottom + 1 ||
                    labelR.left < shapeR.left - 1 || labelR.top < shapeR.top - 1;
    const padX = (shapeR.width - labelR.width) / shapeR.width;
    const padY = (shapeR.height - labelR.height) / shapeR.height;
    all.push({ id: n.id, txt: txtContent, shape: [Math.round(shapeR.width), Math.round(shapeR.height)], label: [Math.round(labelR.width), Math.round(labelR.height)], padX: padX.toFixed(2), padY: padY.toFixed(2), outside });
    if (outside) problem.push({ id: n.id, txt: txtContent, shape: [Math.round(shapeR.width), Math.round(shapeR.height)], label: [Math.round(labelR.width), Math.round(labelR.height)] });
  }
  return { all, problem };
});
console.log('PROBLEM:', JSON.stringify(result.problem, null, 1));
console.log('ALL:', JSON.stringify(result.all, null, 1));
await browser.close();
