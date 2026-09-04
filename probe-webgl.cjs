const { chromium } = require('playwright');
const combos = [
  ['--use-gl=swiftshader'],
  ['--use-angle=swiftshader-webgl'],
  ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--disable-gpu'],
  ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
];
(async () => {
  for (const args of combos) {
    try {
      const b = await chromium.launch({ args });
      const p = await b.newPage();
      const got = await p.evaluate(() => {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        return gl ? gl.getParameter(gl.VERSION) : null;
      });
      console.log(JSON.stringify(args), '->', got || 'NO WEBGL');
      await b.close();
    } catch (e) { console.log(JSON.stringify(args), '-> LAUNCH ERR', String(e).slice(0,80)); }
  }
})();
