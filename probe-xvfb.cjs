const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl');
    return ctx ? ctx.getParameter(ctx.VERSION) : 'NO WEBGL';
  });
  console.log('WEBGL:', gl);
  await page.goto('http://127.0.0.1:3201/inferflux/gpt-3d.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const st = await page.evaluate(() => {
    const canvas = document.getElementById('gl');
    return {
      canvasW: canvas?.width, canvasH: canvas?.height,
      title: document.getElementById('title')?.textContent,
      step: document.getElementById('stepName')?.textContent,
      dims: document.getElementById('dims')?.textContent,
      hint: document.getElementById('hint')?.textContent?.slice(0,30),
      errorBanner: document.querySelector('div[style*="background:#2a1518"]')?.textContent || null,
      webglRenderer: !!window.__webglTried,
    };
  });
  console.log('STATE:', JSON.stringify(st, null, 2));
  console.log('ERRORS:', errors.length ? errors : 'none');
  // screenshot
  await page.screenshot({ path: '/tmp/gpt3d-render.png' });
  await browser.close();
})();
