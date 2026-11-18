// Smoke test for /business-process route wrapper + business-processing.html iframe.
// React route DCL is fast; the heavy 3D iframe is inspected separately with generous waits.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // 1. login + goto route wrapper
  await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('auth_loggedIn', 'true');
    localStorage.setItem('auth_username', 'admin');
  });
  await page.goto('http://127.0.0.1:3200/business-process', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const wrapper = await page.evaluate(() => ({
    path: location.pathname,
    title: document.querySelector('h1')?.textContent?.trim(),
    iframeSrc: document.querySelector('iframe[src*="business-processing"]')?.getAttribute('src'),
    sidebar: [...document.querySelectorAll('.sidebar-link')].map(a => a.textContent.trim()).filter(t => t.includes('业务') || t.includes('业务处理')),
  }));
  console.log('WRAPPER:', JSON.stringify(wrapper));

  // 2. find iframe frame and wait for its heavy module script to finish
  let frame = null;
  for (let i = 0; i < 10 && !frame; i++) {
    await page.waitForTimeout(1500);
    frame = page.frames().find(f => f.url().includes('business-processing.html'));
  }
  if (!frame) { console.log('IFRAME NOT FOUND'); console.log('PAGE ERRORS:', JSON.stringify(pageErrors)); await browser.close(); process.exit(1); }

  const frameConsoleErrors = [];
  frame.on('console', (m) => { if (m.type() === 'error') frameConsoleErrors.push(m.text()); });
  frame.on('pageerror', (e) => frameConsoleErrors.push('PAGEERR: ' + String(e)));

  // wait for WebGL canvas to have a size (module executed)
  let ready = false;
  for (let i = 0; i < 15 && !ready; i++) {
    await frame.waitForTimeout(1500);
    ready = await frame.evaluate(() => {
      const c = document.getElementById('webgl');
      return !!(c && c.width > 0 && c.height > 0);
    }).catch(() => false);
  }
  await frame.waitForTimeout(1500);

  // 3. base state (default = pipeline)
  const base = await frame.evaluate(() => ({
    tabs: [...document.querySelectorAll('.tab')].map(t => t.textContent.trim()),
    active: document.querySelector('.tab.active')?.textContent?.trim(),
    canvas: (() => { const c = document.getElementById('webgl'); return !!c && c.width > 0; })(),
    info: document.querySelector('#infopanel h2')?.textContent?.trim(),
    controls: (document.querySelector('#scene-controls')?.textContent || '').slice(0, 50),
    loading: document.getElementById('loading')?.style.display,
  }));
  console.log('BASE:', JSON.stringify(base));

  async function switchTo(name) {
    await frame.evaluate((n) => { const t = document.querySelector(`.tab[data-scene="${n}"]`); if (t) t.click(); });
    await frame.waitForTimeout(1800);
    return frame.evaluate(() => ({
      active: document.querySelector('.tab.active')?.dataset.scene,
      info: document.querySelector('#infopanel h2')?.textContent?.trim(),
      controls: (document.querySelector('#scene-controls')?.textContent || '').slice(0, 60),
      canvas: (() => { const c = document.getElementById('webgl'); return !!c && c.width > 0; })(),
    }));
  }

  // 4. transformer scene + interact
  const tr = await switchTo('transformer');
  const trInter = await frame.evaluate(() => {
    const headChips = [...document.querySelectorAll('#head-row .chip')].map(c => c.textContent.trim());
    const genBtn = !!document.getElementById('gen-step');
    const pr = document.getElementById('tr-prompt');
    if (pr) { pr.value = 'the robot can'; pr.dispatchEvent(new Event('change')); }
    if (genBtn) document.getElementById('gen-step').click();
    return { headChips, genBtn };
  });
  await frame.waitForTimeout(300);

  // 5. pd scene + interact
  const pd = await switchTo('pd');
  const pdInter = await frame.evaluate(() => {
    const bendChips = [...document.querySelectorAll('#bend-row .chip')].map(c => c.textContent.trim());
    const stepBtn = !!document.getElementById('pd-step');
    if (stepBtn) document.getElementById('pd-step').click();
    return { bendChips, stepBtn };
  });
  await frame.waitForTimeout(1200);
  const pdStats = await frame.evaluate(() => ({
    kv: document.getElementById('kv-stat')?.textContent,
    tok: document.getElementById('tok-stat')?.textContent,
  }));

  // 6. back to pipeline
  const back = await switchTo('pipeline');

  console.log('TRANSFORMER:', JSON.stringify(tr), 'INTERACT:', JSON.stringify(trInter));
  console.log('PD:', JSON.stringify(pd), 'INTERACT:', JSON.stringify(pdInter), 'STATS:', JSON.stringify(pdStats));
  console.log('BACK:', JSON.stringify(back));

  await page.screenshot({ path: '/tmp/business-process-route.png' });
  console.log('FRAME CONSOLE/PAGE ERRORS:', frameConsoleErrors.length ? JSON.stringify(frameConsoleErrors.slice(0, 5)) : 'none');
  console.log('WRAPPER PAGE ERRORS:', pageErrors.length ? JSON.stringify(pageErrors.slice(0, 3)) : 'none');

  const pass = wrapper.path === '/business-process' && !!wrapper.iframeSrc
    && base.tabs.length === 3 && base.active?.includes('①') && base.canvas && base.loading === 'none'
    && tr.active === 'transformer' && tr.info && tr.canvas && trInter.genBtn && trInter.headChips.length === 4
    && pd.active === 'pd' && pd.info && pd.canvas && pdInter.stepBtn && pdInter.bendChips.length === 3
    && back.active === 'pipeline'
    && !frameConsoleErrors.length && !pageErrors.length;
  console.log(pass ? 'BUSINESS-PROCESSING SMOKE PASS' : 'BUSINESS-PROCESSING SMOKE FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
