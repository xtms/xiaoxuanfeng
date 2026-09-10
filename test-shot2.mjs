import { chromium } from 'playwright';
const attempts = [
  { args: ['--no-sandbox', '--disable-gpu'] },
  { args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer'] },
  { args: ['--no-sandbox', '--headless=new', '--disable-gpu'] },
  { args: ['--no-sandbox', '--use-gl=swiftshader'] },
];
for (const a of attempts) {
  let browser;
  try {
    browser = await chromium.launch(a);
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.setDefaultTimeout(8000);
    await page.setContent('<html><body style="margin:0"><div style="width:400px;height:200px;background:red">hi</div></body></html>');
    try {
      await page.screenshot({ path: '/tmp/test-shot.png', timeout: 6000 });
      console.log('OK:', JSON.stringify(a.args));
    } catch (e) { console.log('FAIL:', JSON.stringify(a.args), '-', e.message.split('\n')[0]); }
  } catch (e) { console.log('LAUNCH FAIL:', JSON.stringify(a.args), '-', e.message.split('\n')[0]); }
  finally { if (browser) await browser.close(); }
}
