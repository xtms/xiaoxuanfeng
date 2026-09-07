// Smoke test for the two new serving-scheduler pages:
//   /vllm-scheduler    (vLLM V1 scheduler, under 服务调度)
//   /sglang-scheduler  (SGLang scheduler, under 服务调度)
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
      path: '/serving-scheduler',
      expect: ['服务调度概览', '共同点', '差异点', 'Continuous Batching', 'Chunked Prefill', '前缀缓存', '抢占', 'Radix', 'Block Hash', 'PrefillAdder', 'EngineCore'],
      ghBases: ['https://github.com/vllm-project/vllm/blob/main', 'https://github.com/sgl-project/sglang/blob/main'],
      ghMin: 10,
    },
    {
      path: '/vllm-scheduler',
      expect: ['vLLM V1', 'Scheduler', 'Chunked Prefill', '前缀缓存', '抢占', 'Policy', 'EngineCore'],
      ghBases: ['https://github.com/vllm-project/vllm/blob/main'],
      ghMin: 10,
    },
    {
      path: '/sglang-scheduler',
      expect: ['SGLang', 'Radix', '零开销', 'CacheAware', 'Batch', 'chunked'],
      ghBases: ['https://github.com/sgl-project/sglang/blob/main'],
      ghMin: 10,
    },
  ];

  let pass = true;
  const results = [];
  for (const { path, expect, ghBases, ghMin } of routes) {
    const beforeErrors = pageErrors.length;
    await page.goto(`http://127.0.0.1:3200${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500); // allow mermaid render
    const res = await page.evaluate(({ expectList, ghBases, ghMin }) => {
      const h1 = document.querySelector('main h1');
      const text = document.body.innerText;
      const mermaidSvgs = document.querySelectorAll('.mermaid-container svg').length;
      const missing = expectList.filter((s) => !text.includes(s));
      const tables = document.querySelectorAll('main table').length;
      const codeBlocks = document.querySelectorAll('main pre').length;
      const ghLinks = [...document.querySelectorAll('a[href*="github.com"]')].map(a => a.getAttribute('href'));
      const srcLinks = ghLinks.filter(h => h && ghBases.some(b => h.startsWith(b)));
      return {
        title: h1 ? h1.textContent : null,
        mermaidSvgs,
        tables,
        codeBlocks,
        missing,
        ghCount: ghLinks.length,
        srcCount: srcLinks.length,
        okGh: srcLinks.length >= ghMin && srcLinks.every(h => ghBases.some(b => h.startsWith(b))),
      };
    }, { expectList: expect, ghBases, ghMin });
    const errorsNow = pageErrors.slice(beforeErrors);
    const ok = res.title && !res.missing.length && res.mermaidSvgs > 0 && res.tables > 0 && res.okGh && !errorsNow.length;
    if (!ok) pass = false;
    results.push({ path, ...res, newErrors: errorsNow.slice(0, 3), ok });
  }

  for (const r of results) console.log('PAGE:', JSON.stringify(r));
  console.log('PAGE ERRORS:', pageErrors.length ? JSON.stringify(pageErrors.slice(0, 5)) : 'none');
  console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
