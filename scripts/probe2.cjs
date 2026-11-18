const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({
    args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--use-gl=angle','--in-process-gpu','--enable-webgl','--ignore-gpu-blocklist'],
  });
  const p = await b.newPage();
  const got = await p.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    return gl ? gl.getParameter(gl.VERSION) : null;
  });
  console.log('webgl:', got || 'NO');
  await b.close();
})();
