// Compare domcontentloaded timing: my page vs existing model-structure-3d.html
const fs = require('fs');
const { chromium } = require('playwright');
const log = m => fs.appendFileSync('/tmp/bp-debug3.log', m + '\n');

(async () => {
  log('START');
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu'] });
  log('LAUNCHED');
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });

  for (const path of ['/inferflux/business-processing.html', '/inferflux/model-structure-3d.html']) {
    const t0 = Date.now();
    log('--- ' + path);
    try {
      await p.goto('http://127.0.0.1:3205' + path, { waitUntil: 'domcontentloaded', timeout: 25000 });
      log('DCL OK in ' + (Date.now() - t0) + 'ms');
    } catch (e) {
      log('DCL TIMEOUT/ERR in ' + (Date.now() - t0) + 'ms: ' + String(e).slice(0, 100));
    }
    const r = await Promise.race([
      p.evaluate(() => ({ title: document.title, body: document.body.children.length })).then(v => JSON.stringify(v)),
      new Promise(res => setTimeout(() => res('EVAL HANG'), 4000)),
    ]);
    log('EVAL: ' + r);
  }
  await b.close();
  log('DONE');
})().catch(e => { log('TOP ERR: ' + String(e).slice(0, 300)); process.exit(1); });
