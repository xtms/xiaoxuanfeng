import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const chart = readFileSync('/tmp/mooncake-chart.txt', 'utf8').trim();

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;font-family:sans-serif}</style>
</head><body>
<div id="out"></div>
<script type="module">
import mermaid from 'file:///data/sd/xiaoxuanfeng/node_modules/mermaid/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad:false, theme:'base', securityLevel:'loose',
  themeVariables:{ primaryColor:'#eef2ff', primaryTextColor:'#1e293b', primaryBorderColor:'#4f46e5', lineColor:'#6366f1', secondaryColor:'#f1f5f9', tertiaryColor:'#f8fafc', background:'#ffffff', mainBkg:'#f1f5f9', nodeBorder:'#e2e8f0', clusterBkg:'#f8fafc', clusterBorder:'#e2e8f0', titleColor:'#1e293b', edgeLabelBackground:'#ffffff' } });
const chartText = ${JSON.stringify(chart)};
try {
  const { svg } = await mermaid.render('mmd', chartText);
  const div = document.getElementById('out');
  div.innerHTML = svg;
  const svgEl = div.querySelector('svg');
  svgEl.style.maxWidth='none';
} catch (e) {
  document.body.setAttribute('data-error', String(e && e.message || e));
}
</script>
</body></html>`;

writeFileSync('/tmp/render-mooncake.html', html);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 2000 } });
page.setDefaultTimeout(30000);
page.on('pageerror', e => console.log('PAGE ERROR:', e));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 200)); });
await page.goto('file:///tmp/render-mooncake.html', { waitUntil: 'load' });
await page.waitForTimeout(4000);
const err = await page.evaluate(() => document.body.getAttribute('data-error'));
if (err) console.log('RENDER ERROR:', err);
const hasSvg = await page.evaluate(() => !!document.querySelector('#out svg'));
console.log('hasSvg:', hasSvg);
if (hasSvg) {
  const bbox = await page.evaluate(() => {
    const svg = document.querySelector('#out svg');
    const r = svg.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log('SVG size:', bbox);
  await page.screenshot({ path: '/tmp/mooncake-462-current.png', fullPage: true });
  const overflow = await page.evaluate(() => {
    const svg = document.querySelector('#out svg');
    const results = [];
    const nodeEls = svg.querySelectorAll('.node');
    for (const n of nodeEls) {
      const rect = n.querySelector('rect');
      const label = n.querySelector('.label');
      if (!rect || !label) continue;
      const r = rect.getBoundingClientRect();
      const txt = label.getBoundingClientRect();
      const txtContent = (label.textContent || '').replace(/\s+/g, ' ').slice(0, 90);
      const overflowX = txt.width > r.width + 1;
      const overflowY = txt.height > r.height + 1;
      const textOutside = txt.right > r.right + 1 || txt.bottom > r.bottom + 1 || txt.left < r.left - 1 || txt.top < r.top - 1;
      if (overflowX || overflowY || textOutside) {
        results.push({ id: n.id, txt: txtContent,
          box: { w: Math.round(r.width), h: Math.round(r.height) },
          text: { w: Math.round(txt.width), h: Math.round(txt.height) },
          overflowX, overflowY, textOutside });
      }
    }
    return results;
  });
  console.log('OVERFLOW NODES:', JSON.stringify(overflow, null, 2));
}
await browser.close();
