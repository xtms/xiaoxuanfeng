import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const chart = readFileSync('/tmp/mooncake-chart.txt', 'utf8').trim();
const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;font-family:sans-serif}</style>
</head><body>
<div id="out"></div>
<script type="module">
import mermaid from 'http://127.0.0.1:8765/node_modules/mermaid/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad:false, theme:'base', securityLevel:'loose',
  themeVariables:{ primaryColor:'#eef2ff', primaryTextColor:'#1e293b', primaryBorderColor:'#4f46e5', lineColor:'#6366f1', secondaryColor:'#f1f5f9', tertiaryColor:'#f8fafc', background:'#ffffff', mainBkg:'#f1f5f9', nodeBorder:'#e2e8f0', clusterBkg:'#f8fafc', clusterBorder:'#e2e8f0', titleColor:'#1e293b', edgeLabelBackground:'#ffffff' } });
const chartText = ${JSON.stringify(chart)};
try {
  const { svg } = await mermaid.render('mmd', chartText);
  const div = document.getElementById('out');
  div.innerHTML = svg;
  const svgEl = div.querySelector('svg');
  svgEl.style.maxWidth='none';
} catch (e) { document.body.setAttribute('data-error', String(e && e.message || e)); }
</script>
</body></html>`;
writeFileSync('/data/sd/xiaoxuanfeng/render-462.html', html);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 2000 } });
page.setDefaultTimeout(30000);
page.on('pageerror', e => console.log('PAGE ERROR:', e));
await page.goto('http://127.0.0.1:8765/render-462.html', { waitUntil: 'load' });
await page.waitForTimeout(3500);
const hasSvg = await page.evaluate(() => !!document.querySelector('#out svg'));
console.log('hasSvg:', hasSvg);
if (hasSvg) {
  const bbox = await page.evaluate(() => {
    const svg = document.querySelector('#out svg');
    const r = svg.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log('SVG size:', bbox);
  const el = await page.$('#out svg');
  await el.screenshot({ path: '/tmp/mooncake-462-current.png' });
  const overflow = await page.evaluate(() => {
    const svg = document.querySelector('#out svg');
    const results = [];
    for (const n of svg.querySelectorAll('.node')) {
      const label = n.querySelector('.label');
      if (!label) continue;
      const labelR = label.getBoundingClientRect();
      const shapeEl = n.querySelector(':scope > rect, :scope > ellipse, :scope > polygon, :scope > path');
      const shapeR = shapeEl ? shapeEl.getBoundingClientRect() : null;
      const txtContent = (label.textContent || '').replace(/\s+/g, ' ').slice(0, 90);
      if (!shapeR) { results.push({ id: n.id, txt: txtContent, note: 'no shape' }); continue; }
      const overflowX = labelR.width > shapeR.width + 1;
      const overflowY = labelR.height > shapeR.height + 1;
      const outside = labelR.right > shapeR.right + 1 || labelR.bottom > shapeR.bottom + 1 ||
                      labelR.left < shapeR.left - 1 || labelR.top < shapeR.top - 1;
      if (overflowX || overflowY || outside) {
        results.push({ id: n.id, txt: txtContent,
          shape: { w: Math.round(shapeR.width), h: Math.round(shapeR.height) },
          label: { w: Math.round(labelR.width), h: Math.round(labelR.height) },
          overflowX, overflowY, outside });
      }
    }
    return results;
  });
  console.log('OVERFLOW NODES:', JSON.stringify(overflow, null, 2));
}
await browser.close();
