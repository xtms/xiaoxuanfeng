const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:3200/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('auth_loggedIn', 'true');
    localStorage.setItem('auth_username', 'admin');
  });
  await page.goto('http://127.0.0.1:3200/model-structure-3d', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // open the "模型可视化" group (default collapsed) and check the link
  const link = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button.sidebar-group')];
    const vizBtn = buttons.find(b => b.textContent.includes('模型可视化'));
    if (vizBtn) vizBtn.click();
    return true;
  });
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a.sidebar-link, a.sidebar-child-link')];
    const item = links.find(a => a.textContent.includes('MiMo-V2.5 模型结构 3D'));
    return {
      href: item?.getAttribute('href'),
      target: item?.getAttribute('target'),
      isActive: item?.className.includes('active'),
      el: item?.outerHTML.slice(0, 200),
    };
  });
  console.log('SIDEBAR LINK:', JSON.stringify(info, null, 2));
  await page.screenshot({ path: '/tmp/ms3d-final.png' });
  await browser.close();
})();
