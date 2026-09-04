// Extract compact GPT-2 cached data from the transformer-explainer reference
// for the self-contained visualizer module. Outputs a browser-safe JS file.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SRC = '/data/sd/transformer-explainer/src/constants/examples';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'public/inferflux/transformer-explainer-data.js');

const examples = [0, 1, 2, 3, 4].map((i) => require(join(SRC, `ex${i}.js`))[`ex${i}`]);

const round = (v, p = 4) => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf';
  const r = Number(v.toFixed(p));
  // -0 → 0
  return Object.is(r, -0) ? 0 : r;
};

const compact = examples.map((ex) => {
  const n = ex.tokens.length;

  // top-50 probabilities: keep tokenId + raw logit + token (for temp/sampling recompute)
  const probs = ex.probabilities.map((p) => ({
    tokenId: p.tokenId,
    logit: round(p.logit, 4),
    token: p.token,
  }));

  // sampled / predicted token (the one the model picked for this cached run)
  const sampled = ex.sampled
    ? { tokenId: ex.sampled.tokenId, token: ex.sampled.token, rank: ex.sampled.rank }
    : null;

  // attention matrices: per layer(12) x head(12), store raw attn + softmax (n x n).
  // scaled = attn / sqrt(head_dim=64) and masked = causal can be derived in-browser.
  const attn = [];
  const softmax = [];
  for (let L = 0; L < 12; L++) {
    const layerAttn = [];
    const layerSm = [];
    for (let H = 0; H < 12; H++) {
      const kAttn = `block_${L}_attn_head_${H}_attn`;
      const kSm = `block_${L}_attn_head_${H}_attn_softmax`;
      const a = ex.outputs[kAttn]?.data ?? [];
      const s = ex.outputs[kSm]?.data ?? [];
      layerAttn.push(a.map((row) => row.map((v) => round(v, 4))));
      layerSm.push(s.map((row) => row.map((v) => round(v, 4))));
    }
    attn.push(layerAttn);
    softmax.push(layerSm);
  }

  return {
    prompt: ex.prompt,
    tokens: ex.tokens,
    tokenIds: ex.tokenIds,
    n,
    probs,
    sampled,
    attn,
    softmax,
  };
});

const out = `/* Auto-generated from transformer-explainer cached examples — real GPT-2 (distilgpt2)
   activations for 5 prompt examples. Do not edit by hand; regenerate via extract-te-data.mjs */
window.TE_DATA = ${JSON.stringify(compact)};
`;
writeFileSync(OUT, out, 'utf8');
console.log('wrote', OUT, (out.length / 1024).toFixed(0) + 'KB');
