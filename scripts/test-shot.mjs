import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.setDefaultTimeout(15000);
await page.setContent('<html><body style="margin:0"><div style="width:400px;height:200px;background:red">hi</div></body></html>');
try {
  await page.screenshot({ path: '/tmp/test-shot.png', timeout: 10000 });
  console.log('simple shot OK');
} catch (e) { console.log('simple shot FAIL:', e.message.split('\n')[0]); }
await browser.close();
