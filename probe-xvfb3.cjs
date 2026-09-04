const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const failed = [];
  page.on('requestfailed', r => failed.push('FAILED: ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) failed.push('HTTP ' + r.status() + ': ' + r.url()); });
  await page.goto('http://127.0.0.1:3201/inferflux/gpt-3d.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  // Read pixels through the renderer's own drawing buffer using a fresh webgl context
  const renderState = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 2;
    const ctx = c.getContext('webgl');
    const px = new Uint8Array(4);
    ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    const nonBlack = new Uint8Array(4);
    ctx.clearColor(0.1, 0.1, 0.1, 1); ctx.clear(ctx.COLOR_BUFFER_BIT);
    ctx.readPixels(0,0,1,1,ctx.RGBA,ctx.UNSIGNED_BYTE,nonBlack);
    return { freshCtxClear: Array.from(nonBlack) };
  });
  console.log('FAILED RESOURCES:', failed.length ? failed : 'none');
  await page.screenshot({ path: '/tmp/gpt3d-render.png' });
  await browser.close();
})();
