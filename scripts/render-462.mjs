import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const chart = readFileSync('/tmp/mooncake-chart.txt', 'utf8').trim();

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;font-family:sans-serif}svg{display:block}</style>
</head><body>
<pre id="chart" style="display:none"></pre>
<script type="module">
import mermaid from 'file:///data/sd/xiaoxuanfeng/node_modules/mermaid/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad:false, theme:'base', securityLevel:'loose',
  themeVariables:{ primaryColor:'#eef2ff', primaryTextColor:'#1e293b', primaryBorderColor:'#4f46e5', lineColor:'#6366f1', secondaryColor:'#f1f5f9', tertiaryColor:'#f8fafc', background:'#ffffff', mainBkg:'#f1f5f9', nodeBorder:'#e2e8f0', clusterBkg:'#f8fafc', clusterBorder:'#e2e8f0', titleColor:'#1e293b', edgeLabelBackground:'#ffffff' } });
const chartText = document.getElementById('chart').textContent;
const { svg } = await mermaid.render('mmd', chartText);
document.body.innerHTML = svg;
const svgEl = document.querySelector('svg');
svgEl.style.maxWidth='none';
document.body.appendChild(svgEl);
</script>
</body></html>`;

import { writeFileSync } from 'fs';
writeFileSync('/tmp/render-mooncake.html', html);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
page.on('pageerror', e => console.log('PAGE ERROR:', e));
await page.goto('file:///tmp/render-mooncake.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
// Set chart text
await page.evaluate((c) => { document.getElementById('chart').textContent = c; }, chart);
await page.evaluate(() => location.reload());
await page.waitForTimeout(1500);
// Wait for svg to exist
await page.waitForSelector('svg', { timeout: 10000 });
const bbox = await page.evaluate(() => {
  const svg = document.querySelector('svg');
  const r = svg.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
console.log('SVG size:', bbox);
await page.screenshot({ path: '/tmp/mooncake-462.png', fullPage: true });
await browser.close();
