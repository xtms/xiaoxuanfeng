// Smoke test for the ported InfraTech Architecture 3D comparison page:
//   /arch-compare-3d  → iframe → /inferflux/arch-compare-3d/index.html
// Verifies: route renders, iframe loads, WebGL scene builds (loading overlay
// hides => GLB assets fetched + parsed), 8-model pickers, theme toggle, story mode.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // Login bypass (route is behind ProtectedRoute)
  await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('auth_loggedIn', 'true');
    localStorage.setItem('auth_username', 'admin');
  });

  // 1. The app route renders an iframe pointing at the ported page
  await page.goto('http://127.0.0.1:3200/arch-compare-3d', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const host = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const iframe = document.querySelector('iframe');
    return {
      h1: h1 ? h1.textContent : null,
      iframeSrc: iframe ? iframe.getAttribute('src') : null,
      tags: [...document.querySelectorAll('.page-meta-item')].map((e) => e.textContent.trim()),
    };
  });
  console.log('HOST:', JSON.stringify(host));

  if (!host.iframeSrc || !host.iframeSrc.includes('arch-compare-3d')) {
    console.log('SMOKE FAIL: iframe not found');
    await browser.close();
    process.exit(1);
  }

  // 2. Wait for the iframe app to become ready (loading overlay hidden)
  await page.locator('iframe[src*="arch-compare-3d"]').waitFor({ state: 'attached' });
  await page.waitForTimeout(800);
  const frame = page.frames().find((f) => f !== page.mainFrame() && f.url().includes('inferflux/arch-compare-3d'));
  if (!frame) {
    console.log('SMOKE FAIL: iframe frame not reachable');
    await browser.close();
    process.exit(1);
  }

  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      ready = await frame.evaluate(() => {
        const loading = document.getElementById('loading');
        const hidden = !loading || loading.hidden || getComputedStyle(loading).display === 'none';
        return hidden;
      });
    } catch { /* iframe may be re-navigating */ }
    if (ready) break;
    await page.waitForTimeout(500);
  }
  console.log('APP READY (loading hidden):', ready);

  // 3. Inspect the rendered app inside the iframe
  const state = await frame.evaluate(() => {
    const canvas = document.getElementById('scene');
    const picks = [...document.querySelectorAll('.model-pick')];
    const tabs = [...document.querySelectorAll('.model-tab strong')].map((e) => e.textContent);
    const modelOptions = picks.map((p) => {
      const sel = p.querySelector('select');
      return sel ? sel.options.length : 0;
    });
    const labels = document.querySelectorAll('.label').length;
    return {
      canvas: !!canvas,
      canvasW: canvas ? canvas.width : 0,
      canvasH: canvas ? canvas.height : 0,
      webgl: (() => {
        try {
          const gl = canvas && canvas.getContext('webgl2') || canvas && canvas.getContext('webgl');
          return !!gl;
        } catch { return false; }
      })(),
      tabs,
      modelOptions,
      labels,
      title: (document.getElementById('app-title') || {}).textContent || '',
      theme: document.body.dataset.theme,
    };
  });
  console.log('APP STATE:', JSON.stringify(state));

  // 4. Theme toggle: switch to dark
  await frame.evaluate(() => {
    const darkBtn = document.querySelector('.theme-switch [data-theme="dark"]');
    if (darkBtn) darkBtn.click();
  });
  await page.waitForTimeout(300);
  const themeAfter = await frame.evaluate(() => document.body.dataset.theme);
  console.log('THEME after dark click:', themeAfter);

  // 5. Start story mode
  await frame.evaluate(() => {
    const btn = document.getElementById('story-toggle');
    if (!btn.disabled) btn.click();
  });
  await page.waitForTimeout(400);
  const story = await frame.evaluate(() => ({
    active: document.body.classList.contains('is-story'),
    panelHidden: document.getElementById('story-panel') ? document.getElementById('story-panel').hidden : null,
    chapters: document.querySelectorAll('#story-chapters button').length,
    title: (document.getElementById('story-title') || {}).textContent || '',
  }));
  console.log('STORY:', JSON.stringify(story));

  // 6. Switch the right model via the picker
  await frame.evaluate(() => {
    const sel = document.querySelector('.model-pick[data-era="1"] select');
    sel.value = 'kimi-k3';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(2500); // rebuild + home camera
  const afterSwap = await frame.evaluate(() => {
    const pick = document.querySelector('.model-pick[data-era="1"]');
    return pick.querySelector('strong').textContent;
  });
  console.log('RIGHT MODEL after swap to kimi-k3:', afterSwap);

  const iframeErrors = errors.slice();
  console.log('PAGE/CONSOLE ERRORS:', iframeErrors.length ? JSON.stringify(iframeErrors.slice(0, 8)) : 'none');

  const pass = host.iframeSrc
    && ready
    && state.canvas && state.canvasW > 0 && state.webgl
    && state.modelOptions.length === 2 && state.modelOptions.every((n) => n === 9)
    && state.labels > 0
    && themeAfter === 'dark'
    && story.active && story.chapters > 0
    && afterSwap === 'Kimi K3'
    && !iframeErrors.length;

  console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
