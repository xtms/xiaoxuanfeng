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
  // Check if the 3D scene actually has objects / non-black pixels
  const renderState = await page.evaluate(() => {
    const canvas = document.getElementById('gl');
    const ctx = canvas.getContext('webgl');
    const px = new Uint8Array(4);
    ctx.readPixels(Math.floor(canvas.width/2), Math.floor(canvas.height/2), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    return { centerPixel: Array.from(px) };
  });
  console.log('CENTER PIXEL:', JSON.stringify(renderState.centerPixel));
  console.log('FAILED RESOURCES:', failed.length ? failed : 'none');
  await page.screenshot({ path: '/tmp/gpt3d-render.png' });
  await browser.close();
})();
