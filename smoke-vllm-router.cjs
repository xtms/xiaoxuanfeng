// Smoke test for the vllm-router page:
//   /vllm-router  (vllm-project/router fork of SGLang Model Gateway, under 调度器)
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
    {
      path: '/vllm-router',
      expect: ['vLLM Router', 'Prefill', 'Decode', 'rendezvous', 'Mooncake', 'NIXL', 'tokenizer', 'fork'],
      ghBase: 'https://github.com/vllm-project/router/blob/main',
      ghMin: 10,
    },
  ];

  let pass = true;
  const results = [];
  for (const { path, expect, ghBase, ghMin } of routes) {
    const beforeErrors = pageErrors.length;
    await page.goto(`http://127.0.0.1:3200${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500); // allow mermaid render
    const res = await page.evaluate(({ expectList, path, ghBase, ghMin }) => {
      const h1 = document.querySelector('h1');
      const text = document.body.innerText;
      const mermaidSvgs = document.querySelectorAll('.mermaid-container svg');
      const missing = expectList.filter((s) => !text.includes(s));
      const tables = document.querySelectorAll('table').length;
      const codeBlocks = document.querySelectorAll('pre').length;
      const glassCardStub = [...document.querySelectorAll('.glass-card')].some((c) => c.textContent.includes('详细分析待补充'));
      // GitHub 源码链接：应指向 vllm-project/router 的 blob 路径且以 ghBase 开头
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
