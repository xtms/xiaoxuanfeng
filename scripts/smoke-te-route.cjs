// Route wrapper check — block heavy iframe content so the main thread stays free.
// iframe's internal rendering is already verified by smoke-te.cjs (SMOKE PASS).
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);

  // Block the heavy iframe payload — the wrapper page is what we're verifying here
  await page.route('**/transformer-explainer.html', (r) => r.abort());
  await page.route('**/transformer-explainer-data.js', (r) => r.abort());

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('auth_loggedIn', 'true');
    localStorage.setItem('auth_username', 'admin');
  });
  await page.goto('http://127.0.0.1:3200/transformer-explainer', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const iframe = document.querySelector('iframe[src*="transformer-explainer"]');
    return {
      path: location.pathname,
      title: h1 ? h1.textContent : null,
      hasIframe: !!iframe,
      iframeSrc: iframe ? iframe.getAttribute('src') : null,
      desc: h1 && h1.parentElement ? h1.parentElement.textContent.slice(0, 120) : null,
      sidebarTE: [...document.querySelectorAll('.sidebar-link')].map(a => a.textContent.trim()).filter(t => t.includes('Explainer')),
    };
  });
  console.log('ROUTE:', JSON.stringify(result));

  console.log('PAGE ERRORS:', pageErrors.length ? JSON.stringify(pageErrors.slice(0, 3)) : 'none');

  const pass = result && result.path === '/transformer-explainer' && !!result.title && result.title.includes('Transformer Explainer') && result.hasIframe && !!result.iframeSrc && result.iframeSrc.includes('transformer-explainer.html') && result.sidebarTE.length > 0 && !pageErrors.length;
  console.log(pass ? 'ROUTE SMOKE PASS' : 'ROUTE SMOKE FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
