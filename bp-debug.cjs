// Debug hang for business-processing.html — logs to /tmp/bp-debug.log
const fs = require('fs');
const { chromium } = require('playwright');
const log = m => fs.appendFileSync('/tmp/bp-debug.log', m + '\n');

(async () => {
  log('START ' + new Date().toISOString());
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu'] });
  log('LAUNCHED');
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('C:' + m.text()); });
  log('GOTO...');
  try {
    await p.goto('http://127.0.0.1:3205/inferflux/business-processing.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
    log('GOTO RESOLVED');
  } catch (e) { log('GOTO ERR: ' + String(e).slice(0, 150)); }
  log('WAIT...');
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => ({
    tabs: document.querySelectorAll('.tab').length,
    canvas: !!document.getElementById('webgl'),
    loading: document.getElementById('loading')?.style.display,
    info: document.querySelector('#infopanel h2')?.textContent?.trim(),
  }));
  log('RESULT: ' + JSON.stringify(r));
  log('ERRORS: ' + JSON.stringify(errs.slice(0, 8)));
  await b.close();
  log('DONE');
})().catch(e => { log('TOP ERR: ' + String(e).slice(0, 400)); process.exit(1); });
