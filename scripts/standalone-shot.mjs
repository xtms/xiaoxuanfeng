import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
const chart = readFileSync('/tmp/mooncake-chart.txt', 'utf8').trim();
const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;font-family:sans-serif}</style>
</head><body><div id="out"></div>
<script type="module">
import mermaid from 'http://127.0.0.1:8765/node_modules/mermaid/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad:false, theme:'base', securityLevel:'loose',
  themeVariables:{ primaryColor:'#eef2ff', primaryTextColor:'#1e293b', primaryBorderColor:'#4f46e5', lineColor:'#6366f1', secondaryColor:'#f1f5f9', tertiaryColor:'#f8fafc', background:'#ffffff', mainBkg:'#f1f5f9', nodeBorder:'#e2e8f0', clusterBkg:'#f8fafc', clusterBorder:'#e2e8f0', titleColor:'#1e293b', edgeLabelBackground:'#ffffff' } });
try { const { svg } = await mermaid.render('mmd', ${JSON.stringify(chart)}); document.getElementById('out').innerHTML = svg; document.querySelector('#out svg').style.maxWidth='none'; }
catch (e) { document.body.setAttribute('data-error', String(e && e.message || e)); }
</script></body></html>`;
writeFileSync('/data/sd/xiaoxuanfeng/render-462.html', html);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 4400 } });
page.setDefaultTimeout(20000);
page.on('pageerror', e => console.log('PAGE ERROR:', e));
await page.goto('http://127.0.0.1:8765/render-462.html', { waitUntil: 'load' });
await page.waitForTimeout(3000);
const sz = await page.evaluate(() => {
  const svg = document.querySelector('#out svg');
  const r = svg.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
console.log('svg size:', JSON.stringify(sz));
const cdp = await page.context().newCDPSession(page);
const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
writeFileSync('/tmp/mooncake-462-current.png', Buffer.from(shot.data, 'base64'));
console.log('saved');
await browser.close();
