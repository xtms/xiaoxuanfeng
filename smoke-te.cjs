// Smoke test for transformer-explainer.html — headless chromium
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto('http://127.0.0.1:3200/inferflux/transformer-explainer.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 1. base render state
  const base = await page.evaluate(() => ({
    dataLen: window.TE_DATA?.length,
    tokenCols: document.querySelectorAll('#colTokens .token-row').length,
    qkvRows: document.querySelectorAll('#colQkv .token-row').length,
    mlpRows: document.querySelectorAll('#colMlp .token-row').length,
    attnCells: document.querySelectorAll('#attnSvg rect').length,
    probRows: document.querySelectorAll('#probList .prob-row').length,
    predText: document.querySelector('#predStrip')?.textContent?.slice(0, 40),
    canvases: [...document.querySelectorAll('canvas')].filter(c => c.width > 0 && c.height > 0).length,
  }));
  console.log('BASE:', JSON.stringify(base, null, 2));

  // sanity: token count matches data, matrices square
  const n = await page.evaluate(() => {
    const d = window.TE_DATA[0];
    return { n: d.n, attn0len: d.attn[0][0].length, attn0rowlen: d.attn[0][0][0].length, softmax0len: d.softmax[0][0].length };
  });
  console.log('DATA:', JSON.stringify(n));

  // 2. interact: change layer + head + temperature
  await page.evaluate(() => {
    const setVal = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); };
    setVal('inpLayer', 5); setVal('inpHead', 7); setVal('inpTemp', 30);
  });
  await page.waitForTimeout(200);
  const inter = await page.evaluate(() => ({
    probRows: document.querySelectorAll('#probList .prob-row').length,
    firstProb: document.querySelector('#probList .prob-row')?.textContent?.slice(0, 40),
  }));
  console.log('AFTER CONTROLS:', JSON.stringify(inter));

  // 3. open overlay, check 3 stages exist, close
  await page.evaluate(() => document.getElementById('attnHead').click());
  await page.waitForTimeout(200);
  const ov = await page.evaluate(() => {
    const overlay = document.getElementById('overlay');
    const stages = [...document.querySelectorAll('#overlay .mstage .mname')].map(b => b.textContent?.trim());
    return { visible: overlay.style.display !== 'none' && getComputedStyle(overlay).display !== 'none', stages, rects: document.querySelectorAll('#overlay svg rect').length };
  });
  console.log('OVERLAY:', JSON.stringify(ov));
  await page.evaluate(() => document.getElementById('ovClose').click());
  await page.waitForTimeout(100);

  // 4. resample
  await page.evaluate(() => document.getElementById('btnGenerate').click());
  await page.waitForTimeout(100);
  const pred2 = await page.evaluate(() => document.querySelector('#predStrip')?.textContent?.slice(0, 50));
  console.log('AFTER RESAMPLE:', JSON.stringify(pred2));

  // 5. language toggle
  await page.evaluate(() => document.getElementById('btnLang').click());
  await page.waitForTimeout(100);
  const lang = await page.evaluate(() => document.getElementById('btnLang').textContent);
  console.log('LANG BTN:', lang);

  // 6. click a token row (re-render pipeline)
  await page.evaluate(() => { document.querySelector('#colTokens .token-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.waitForTimeout(150);

  const okCanvas = base.canvases > 0;

  console.log('CONSOLE ERRORS:', consoleErrors.length ? JSON.stringify(consoleErrors) : 'none');
  console.log('PAGE ERRORS:', pageErrors.length ? JSON.stringify(pageErrors) : 'none');

  const pass = base.tokenCols > 0 && base.attnCells > 0 && base.probRows > 0 && okCanvas && !pageErrors.length && !consoleErrors.length;
  console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
