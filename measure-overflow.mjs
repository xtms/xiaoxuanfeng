import { chromium } from 'playwright';
import { readFileSync } from 'fs';
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
import { writeFileSync } from 'fs';
writeFileSync('/data/sd/xiaoxuanfeng/render-462.html', html);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 2000 } });
page.setDefaultTimeout(30000);
await page.goto('http://127.0.0.1:8765/render-462.html', { waitUntil: 'load' });
await page.waitForTimeout(3000);
const data = await page.evaluate(() => {
  const svg = document.querySelector('#out svg');
  if (!svg) return { error: document.body.getAttribute('data-error') };
  const all = [];
  const overflow = [];
  for (const n of svg.querySelectorAll('.node')) {
    const label = n.querySelector('.label');
    if (!label) continue;
    const labelR = label.getBoundingClientRect();
    const shapeEl = n.querySelector(':scope > rect, :scope > ellipse, :scope > polygon, :scope > path');
    const shapeR = shapeEl ? shapeEl.getBoundingClientRect() : null;
    const txtContent = (label.textContent || '').replace(/\s+/g, ' ').slice(0, 90);
    if (!shapeR) { overflow.push({ id: n.id, txt: txtContent, note: 'no shape' }); continue; }
    const ratioX = (labelR.width / shapeR.width).toFixed(2);
    const ratioY = (labelR.height / shapeR.height).toFixed(2);
    const outside = labelR.right > shapeR.right + 1 || labelR.bottom > shapeR.bottom + 1 ||
                    labelR.left < shapeR.left - 1 || labelR.top < shapeR.top - 1;
    all.push({ id: n.id, txt: txtContent, shape: [Math.round(shapeR.width), Math.round(shapeR.height)], label: [Math.round(labelR.width), Math.round(labelR.height)], ratioX, ratioY, outside });
    if (outside) overflow.push({ id: n.id, txt: txtContent, shape: [Math.round(shapeR.width), Math.round(shapeR.height)], label: [Math.round(labelR.width), Math.round(labelR.height)], ratioX, ratioY });
  }
  return { all, overflow };
});
console.log(JSON.stringify(data, null, 1));
await browser.close();
