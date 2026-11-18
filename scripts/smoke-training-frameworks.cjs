// Smoke test for the three rewritten auto-drive training-framework pages:
//   /auto-drive/mtr  /auto-drive/drivevla-w0  /auto-drive/emu3
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(15000);

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

  // Login bypass
  await page.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('auth_loggedIn', 'true');
    localStorage.setItem('auth_username', 'admin');
  });

  const routes = [
    { path: '/auto-drive/mtr', expect: ['训练框架', 'MotionTransformer', 'GMM', 'AdamW'], ghBase: 'https://github.com/sshaoshuai/MTR/blob/master/', ghMin: 8 },
    { path: '/auto-drive/drivevla-w0', expect: ['训练框架', 'Emu3', 'Flow-Matching', 'ZeRO-3'], ghBase: 'https://github.com/BraveGroup/DriveVLA-W0/blob/main/', ghMin: 13 },
    { path: '/auto-drive/emu3', expect: ['训练框架', 'VQ', 'next-token', 'tiktoken'], ghBase: 'https://github.com/baaivision/Emu3/blob/main/', ghMin: 12 },
    { path: '/auto-drive/uniad', expect: ['训练框架', 'UniAD', 'BEVFormer', 'AdamW'], ghBase: 'https://github.com/OpenDriveLab/UniAD/blob/v2.0/', ghMin: 13 },
    { path: '/auto-drive/cosmos-framework', expect: ['训练框架', 'ImaginaireTrainer', 'FSDP', 'TOML'], ghBase: 'https://github.com/NVIDIA/cosmos-framework/blob/main/', ghMin: 13 },
  ];

  let pass = true;
  const results = [];
  for (const { path, expect, ghBase, ghMin } of routes) {
    const beforeErrors = pageErrors.length;
    await page.goto(`http://127.0.0.1:3200${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200); // allow mermaid render
    const res = await page.evaluate(({ expectList, path, ghBase, ghMin }) => {
      const h1 = document.querySelector('h1');
      const text = document.body.innerText;
      const mermaidSvgs = document.querySelectorAll('.mermaid-container svg');
      const missing = expectList.filter((s) => !text.includes(s));
      const tables = document.querySelectorAll('table').length;
      const codeBlocks = document.querySelectorAll('pre').length;
      const glassCardStub = [...document.querySelectorAll('.glass-card')].some((c) => c.textContent.includes('详细分析待补充'));
      // GitHub 源码链接：应指向对应仓库的 blob 分支且路径均以 ghBase 开头
      const ghLinks = [...document.querySelectorAll('a[href*="github.com"]')].map(a => a.getAttribute('href'));
      const srcLinks = ghLinks.filter(h => h && h.startsWith(ghBase));
      const okGh = srcLinks.length >= ghMin && srcLinks.every(h => h.startsWith(ghBase));
      return {
        title: h1 ? h1.textContent : null,
        mermaidSvgs: mermaidSvgs.length,
        tables,
        codeBlocks,
        missing,
        stillStub: glassCardStub,
        ghLinks: ghLinks.slice(0, 2),
        ghCount: ghLinks.length,
        srcCount: srcLinks.length,
        okGh,
      };
    }, { expectList: expect, path, ghBase, ghMin });
    const errorsNow = pageErrors.slice(beforeErrors);
    const ok = res.title && !res.missing.length && !res.stillStub && res.mermaidSvgs > 0 && res.tables > 0 && res.okGh && !errorsNow.length;
    if (!ok) pass = false;
    results.push({ path, ...res, newErrors: errorsNow.slice(0, 3), ok });
  }

  for (const r of results) console.log('PAGE:', JSON.stringify(r));
  console.log('PAGE ERRORS:', pageErrors.length ? JSON.stringify(pageErrors.slice(0, 5)) : 'none');
  console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
