// Smoke test for gpt-3d.html — run with swiftshader (headless, no GPU)
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto('http://127.0.0.1:3201/inferflux/gpt-3d.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // 1. canvas rendered
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('#gl');
    return { found: !!c, w: c?.width, h: c?.height };
  });
  console.log('CANVAS:', JSON.stringify(canvasInfo));

  // 2. no crash on default preset (small)
  const buildState = await page.evaluate(() => {
    const gl = document.getElementById('gl');
    return { webgl: !!gl, ok: document.querySelector('.hud-title')?.textContent?.trim() || '' };
  });
  console.log('HUD title:', buildState.ok);

  // 3. switch all 3 presets — expect no page errors and canvas present
  for (const preset of ['nano', 'small', 'base']) {
    const ok = await page.evaluate((p) => {
      const sel = document.getElementById('selModel');
      sel.value = p;
      sel.dispatchEvent(new Event('change'));
      return true;
    }, preset);
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => {
      const gl = document.getElementById('gl');
      const dims = document.querySelector('#dimDims') || document.querySelector('.hud-dims');
      return { w: gl?.width, h: gl?.height, dims: dims?.textContent?.trim() || '' };
    });
    console.log(`PRESET ${preset}:`, JSON.stringify(st));
    if (pageErrors.length) { console.log('PAGE ERRORS after', preset, pageErrors); }
  }

  // 4. X-ray toggle
  await page.evaluate(() => { document.getElementById('btnXray').click(); });
  await page.waitForTimeout(300);
  const xray = await page.evaluate(() => document.getElementById('btnXray').textContent);
  console.log('XRAY btn after toggle:', xray);

  // 5. language toggle
  await page.evaluate(() => { document.getElementById('btnLang').click(); });
  await page.waitForTimeout(300);
  const langBtn = await page.evaluate(() => document.getElementById('btnLang').textContent);
  console.log('LANG btn:', langBtn);

  console.log('CONSOLE ERRORS:', consoleErrors.length ? JSON.stringify(consoleErrors) : 'none');
  console.log('PAGE ERRORS:', pageErrors.length ? JSON.stringify(pageErrors) : 'none');

  const pass = canvasInfo.found && !pageErrors.length && !consoleErrors.length;
  console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
