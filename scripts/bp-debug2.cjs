// Check if business-processing.html blocks main thread (infinite loop?)
const fs = require('fs');
const { chromium } = require('playwright');
const log = m => fs.appendFileSync('/tmp/bp-debug2.log', m + '\n');

(async () => {
  log('START');
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu'] });
  log('LAUNCHED');
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR: ' + String(e).slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });
  log('GOTO commit...');
  try {
    await p.goto('http://127.0.0.1:3205/inferflux/business-processing.html', { waitUntil: 'commit', timeout: 15000 });
    log('GOTO commit RESOLVED');
  } catch (e) { log('GOTO ERR: ' + String(e).slice(0, 150)); }

  // try evaluate with its own timeout — if main thread blocked, this hangs
  log('EVAL 1 (with timeout)...');
  const r1 = await Promise.race([
    p.evaluate(() => ({ title: document.title, bodyChildren: document.body.children.length })).then(v => JSON.stringify(v)),
    new Promise(res => setTimeout(() => res('EVAL1 TIMED OUT (main thread blocked?)'), 6000)),
  ]);
  log('EVAL1: ' + r1);

  await p.waitForTimeout(2000);
  log('ERRORS SO FAR: ' + JSON.stringify(errs.slice(0, 5)));
  await b.close();
  log('DONE');
})().catch(e => { log('TOP ERR: ' + String(e).slice(0, 300)); process.exit(1); });
