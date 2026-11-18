// Probe route wrapper /business-process — why does evaluate hang?
const fs = require('fs');
const { chromium } = require('playwright');
const log = m => fs.appendFileSync('/tmp/bp-debug4.log', m + '\n');

(async () => {
  log('=== START ===');
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu'] });
  log('LAUNCHED');
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR: ' + String(e).slice(0, 300)));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 300)); });

  // login page
  try {
    await p.goto('http://127.0.0.1:3200/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
    log('LOGIN DCL OK');
  } catch (e) { log('LOGIN ERR: ' + String(e).slice(0, 150)); }
  await p.evaluate(() => {
    localStorage.setItem('auth_loggedIn', 'true');
    localStorage.setItem('auth_username', 'admin');
    return localStorage.getItem('auth_loggedIn');
  }).then(v => log('LOCALSTORAGE SET: ' + v)).catch(e => log('LS ERR: ' + String(e).slice(0, 150)));

  // goto business-process
  const t0 = Date.now();
  try {
    await p.goto('http://127.0.0.1:3200/business-process', { waitUntil: 'domcontentloaded', timeout: 20000 });
    log('BP GOTO DCL OK in ' + (Date.now() - t0) + 'ms');
  } catch (e) { log('BP GOTO ERR: ' + String(e).slice(0, 200)); }

  log('URL NOW: ' + p.url());
  log('WAIT 3000');
  await p.waitForTimeout(3000);
  log('URL AFTER WAIT: ' + p.url());

  const r = await Promise.race([
    p.evaluate(() => ({ path: location.pathname, iframes: [...document.querySelectorAll('iframe')].map(f => f.getAttribute('src')) })).then(v => JSON.stringify(v)),
    new Promise(res => setTimeout(() => res('EVAL HANG'), 8000)),
  ]);
  log('EVAL: ' + r);

  log('ERRORS: ' + JSON.stringify(errs.slice(0, 5)));
  // count frames
  log('FRAMES: ' + JSON.stringify(p.frames().map(f => f.url().slice(0, 80))));
  await b.close();
  log('DONE');
})().catch(e => { log('TOP ERR: ' + String(e).slice(0, 400)); process.exit(1); });
