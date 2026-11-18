const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type().toUpperCase() + ': ' + m.text()); });

  // login directly by setting localStorage, then goto target
  await page.goto('http://127.0.0.1:3200/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('auth_loggedIn', 'true');
    localStorage.setItem('auth_username', 'admin');
  });

  await page.goto('http://127.0.0.1:3200/model-structure-3d', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const st = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    rootHtmlLen: document.getElementById('root')?.innerHTML.length ?? -1,
    rootText: (document.getElementById('root')?.innerText || '').slice(0, 200),
    hasIframe: !!document.querySelector('iframe'),
    iframeSrc: document.querySelector('iframe')?.getAttribute('src'),
    bodyText: document.body.innerText.slice(0, 120),
  }));
  console.log('STATE:', JSON.stringify(st, null, 2));

  let frameInfo = null;
  try {
    const frame = page.frames().find(f => f.url().includes('model-structure-3d.html'));
    if (frame) {
      await frame.waitForTimeout(2500);
      frameInfo = await frame.evaluate(() => {
        const canvas = document.getElementById('gl');
        const banner = document.querySelector('div[style*="background:#2a1518"]');
        return {
          canvasW: canvas?.width, canvasH: canvas?.height,
          title: document.getElementById('title')?.textContent,
          errorBanner: banner?.textContent || null,
        };
      });
    } else {
      frameInfo = { notFound: 'no frame with model-structure-3d.html' };
    }
  } catch (e) { frameInfo = { error: String(e) }; }

  console.log('FRAME:', JSON.stringify(frameInfo, null, 2));
  console.log('ERRORS:', errors.length ? errors : 'none');
  await page.screenshot({ path: '/tmp/ms3d-page.png' });
  await browser.close();
})();
