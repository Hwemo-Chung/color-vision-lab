// Derives the plate colour pairs by computation with our own simulator.
//
//   npm run derive-palettes                               -> PALETTES as JSON
//   npm run derive-palettes -- --verbose                  -> plus per-view dE (stderr)
//   npm run derive-palettes -- --module > src/core/palettes.js   -> regenerate the module
//
// The output is vendored in palettes.js (next to the jitter range it assumes);
// tests/plates.test.js re-runs derivePalettes() and checks it reproduces the
// vendored values exactly, so the plate colours cannot silently become
// hand-picked.
//
// Method (deterministic, seeded):
//   For each plate kind there is a set of views that must NOT separate the two
//   colours ("hidden": e.g. protan and deutan for a red-green plate) and a set
//   that must ("visible": normal vision plus the other deficiency types).
//   Every view is simulated at severity 1 with cvd.js and compared with the
//   CIE76 colour difference in CIELAB. With vis = min dE over visible views and
//   hid = max dE over hidden views, a pair is scored as
//       min(CAP, vis) - 50 * max(0, hid - HIDDEN_MAX[kind]) - 0.5 * hid
//   (a soft constraint hid <= HIDDEN_MAX, then as much visible contrast as
//   possible) and maximised by multi-start hill climbing over integer sRGB pairs.
//   Red-green pairs cannot collapse exactly for protan AND deutan at once (the
//   two confusion directions differ); exploring the trade-off showed normal-vision
//   dE stays at roughly 9-10x the residual (residual 1.5 -> ~8-12, 2 -> ~16-18,
//   2.5 -> ~20-22, 3 -> ~24-27). HIDDEN_MAX.redgreen = 2.5 was chosen because at
//   2 the figure was hard to see even for normal vision in a rendered check,
//   while 2.5 still keeps the protan/deutan separability of the plates well
//   below the "hidden" threshold. Single-type pairs collapse almost exactly. Pairs
//   must keep headroom for the per-dot luminance jitter (every dot colour is the
//   base colour scaled in linear light by a factor in [JITTER_MIN, JITTER_MAX]),
//   both unsimulated and under the hidden views, so the jitter never clips.
//   Because the simulations are linear maps of linear RGB, scaling commutes with
//   them: figure and background dots get the same brightness distribution
//   under the hidden view, so brightness carries no cue there.

import { srgbToLinear, linearToLab } from './color.js';
import { cvdKernel } from './cvd.js';
import { mulberry32 } from './random.js';
import { JITTER_MIN, JITTER_MAX } from './palettes.js';

const VIEWS = ['normal', 'protan', 'deutan', 'tritan', 'achroma'];

/** Views in which the figure must vanish / must stay visible, per plate kind. */
export const KIND_RULES = {
  control:  { hidden: [],                   visible: ['normal', 'protan', 'deutan', 'tritan', 'achroma'] },
  redgreen: { hidden: ['protan', 'deutan'], visible: ['normal', 'tritan'] },
  protan:   { hidden: ['protan'],           visible: ['normal', 'deutan', 'tritan'] },
  deutan:   { hidden: ['deutan'],           visible: ['normal', 'protan', 'tritan'] },
  tritan:   { hidden: ['tritan'],           visible: ['normal', 'protan', 'deutan'] },
};

/** How many distinct colour pairs to derive per kind (plates pick one by seed). */
export const VARIANTS = { control: 1, redgreen: 3, protan: 2, deutan: 2, tritan: 2 };

const CAP = 40;          // visible-side reward stops growing beyond this dE
/** Target ceiling for the hidden-view dE of a pair (CIE76, severity 1). */
export const HIDDEN_MAX = { control: 0, redgreen: 2.5, protan: 1, deutan: 1, tritan: 1 };
const L_RANGE = { control: [25, 88], other: [42, 82] }; // L* of both base colours
const RESTARTS = 300;
const STEPS = [32, 16, 8, 4, 2, 1];

const kernels = Object.fromEntries(VIEWS.map((v) => [v, v === 'normal' ? null : cvdKernel(v, 1)]));

function apply(kernel, lin) {
  if (!kernel) return lin;
  let m = kernel.m1;
  if (kernel.m2 && lin[0] * kernel.n[0] + lin[1] * kernel.n[1] + lin[2] * kernel.n[2] < 0) m = kernel.m2;
  return [
    m[0] * lin[0] + m[1] * lin[1] + m[2] * lin[2],
    m[3] * lin[0] + m[4] * lin[1] + m[5] * lin[2],
    m[6] * lin[0] + m[7] * lin[1] + m[8] * lin[2],
  ];
}

const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** Simulated CIELAB of an sRGB colour under a view (severity 1). */
function viewLab(rgb, view) {
  return linearToLab(apply(kernels[view], rgb.map(srgbToLinear)).map(clamp01));
}

/** dE between a and b under every view. */
export function pairDifferences(a, b) {
  const out = {};
  for (const v of VIEWS) out[v] = dist(viewLab(a, v), viewLab(b, v));
  return out;
}

/** True when the colour, scaled by JITTER_MAX, stays inside 0..1 (also under `views`). */
function hasHeadroom(rgb, views) {
  const lin = rgb.map(srgbToLinear);
  for (const view of ['normal', ...views]) {
    const s = apply(kernels[view], lin);
    for (const c of s) if (c < 0 || c * JITTER_MAX > 1) return false;
  }
  return true;
}

function score(kind, a, b) {
  const rules = KIND_RULES[kind];
  const [lo, hi] = kind === 'control' ? L_RANGE.control : L_RANGE.other;
  const la = viewLab(a, 'normal')[0];
  const lb = viewLab(b, 'normal')[0];
  if (la < lo || la > hi || lb < lo || lb > hi) return -1e9;
  if (!hasHeadroom(a, rules.hidden) || !hasHeadroom(b, rules.hidden)) return -1e9;
  let vis = Infinity;
  for (const v of rules.visible) vis = Math.min(vis, dist(viewLab(a, v), viewLab(b, v)));
  let hid = 0;
  for (const v of rules.hidden) hid = Math.max(hid, dist(viewLab(a, v), viewLab(b, v)));
  if (kind === 'control') return vis;
  return Math.min(CAP, vis) - 50 * Math.max(0, hid - HIDDEN_MAX[kind]) - 0.5 * hid;
}

function climb(kind, start) {
  let cur = start.slice();
  let best = score(kind, cur.slice(0, 3), cur.slice(3));
  for (const step of STEPS) {
    for (;;) {
      let bestMove = null;
      for (let k = 0; k < 6; k++) {
        for (const d of [-step, step]) {
          const v = cur[k] + d;
          if (v < 0 || v > 255) continue;
          const cand = cur.slice();
          cand[k] = v;
          const s = score(kind, cand.slice(0, 3), cand.slice(3));
          if (s > best + 1e-9) {
            best = s;
            bestMove = cand;
          }
        }
      }
      if (!bestMove) break;
      cur = bestMove;
    }
  }
  return { a: cur.slice(0, 3), b: cur.slice(3), score: best };
}

/** Derive VARIANTS[kind] distinct colour pairs for one kind. */
export function deriveKind(kind, seed) {
  const rand = mulberry32(seed);
  const found = [];
  for (let i = 0; i < RESTARTS; i++) {
    const start = Array.from({ length: 6 }, () => Math.floor(rand() * 256));
    const r = climb(kind, start);
    if (r.score > -1e8) found.push(r);
  }
  found.sort((p, q) => q.score - p.score || String(p.a).localeCompare(String(q.a)));
  const picks = [];
  for (const r of found) {
    const distinct = picks.every((p) => {
      const same = Math.max(dist(viewLab(p.a, 'normal'), viewLab(r.a, 'normal')), dist(viewLab(p.b, 'normal'), viewLab(r.b, 'normal')));
      const swapped = Math.max(dist(viewLab(p.a, 'normal'), viewLab(r.b, 'normal')), dist(viewLab(p.b, 'normal'), viewLab(r.a, 'normal')));
      return Math.min(same, swapped) >= 12;
    });
    if (distinct) picks.push(r);
    if (picks.length === VARIANTS[kind]) break;
  }
  return picks.map((p) => [p.a, p.b]);
}

/** All palettes: { kind: [[colourA, colourB], ...] }. */
export function derivePalettes() {
  const out = {};
  let seed = 1009;
  for (const kind of Object.keys(KIND_RULES)) out[kind] = deriveKind(kind, seed++);
  return out;
}

/** Source text of palettes.js for the given palettes. */
export function paletteModule(palettes) {
  const body = Object.entries(palettes)
    .map(([kind, pairs]) => `  ${kind}: [\n${pairs.map(([a, b]) => `    [[${a.join(', ')}], [${b.join(', ')}]],`).join('\n')}\n  ],`)
    .join('\n');
  return `// Plate colour pairs, GENERATED by derive-palettes.js
//   npm run derive-palettes -- --module > src/core/palettes.js
// Do not edit by hand: tests/plates.test.js re-derives them and requires an exact match.
// Each entry is [colourA, colourB] in sRGB; a plate picks one pair by its seed and
// decides by seed which colour is the figure and which the background.

/** Per-dot luminance jitter: linear-light scale factor range applied to every dot. */
export const JITTER_MIN = ${JITTER_MIN};
export const JITTER_MAX = ${JITTER_MAX};

export const PALETTES = {
${body}
};`;
}

// CLI: node src/core/derive-palettes.js
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('derive-palettes.js')) {
  const palettes = derivePalettes();
  if (process.argv.includes('--module')) console.log(paletteModule(palettes));
  else console.log(JSON.stringify(palettes));
  if (process.argv.includes('--verbose')) {
    for (const [kind, pairs] of Object.entries(palettes)) {
      for (const [a, b] of pairs) {
        const d = pairDifferences(a, b);
        console.error(kind, JSON.stringify(a), JSON.stringify(b),
          Object.entries(d).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' '));
      }
    }
  }
}
