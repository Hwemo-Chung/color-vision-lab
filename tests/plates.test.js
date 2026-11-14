import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATES, PALETTES, generatePlate, rasterizePlate, isFigurePoint } from '../src/core/plates.js';
import { derivePalettes } from '../src/core/derive-palettes.js';
import { simulateImageData } from '../src/core/cvd.js';
import { separability } from './helpers.js';

const KINDS = ['control', 'redgreen', 'protan', 'deutan', 'tritan'];

// Separability thresholds (see helpers.separability). One metric, one pair of
// thresholds for every plate.
const SEP_VISIBLE = 3; // figure clearly stands out from the background
const SEP_HIDDEN = 1;  // figure/background mean difference below the dot-to-dot jitter
const VIEWS = [
  ['normal', null],
  ['protan', 'protan'],
  ['deutan', 'deutan'],
  ['tritan', 'tritan'],
  ['achroma', 'achroma'],
];

/** Which views must make the figure vanish, per plate kind. */
const HIDDEN_FOR = {
  control: [],
  redgreen: ['protan', 'deutan'],
  protan: ['protan'],
  deutan: ['deutan'],
  tritan: ['tritan'],
};

test('PLATES: 13 definitions, control first, suggested mix, varied 1-2 digit answers', () => {
  assert.equal(PLATES.length, 13);
  assert.equal(PLATES[0].kind, 'control');
  const ids = new Set(PLATES.map((p) => p.id));
  assert.equal(ids.size, 13);
  const count = Object.fromEntries(KINDS.map((k) => [k, PLATES.filter((p) => p.kind === k).length]));
  assert.deepEqual(count, { control: 1, redgreen: 4, protan: 3, deutan: 3, tritan: 2 });
  for (const p of PLATES) {
    assert.equal(typeof p.id, 'string');
    assert.ok(KINDS.includes(p.kind));
    assert.match(p.answer, /^[0-9]{1,2}$/);
    assert.ok(!(p.answer.length === 2 && p.answer[0] === '0'), 'no leading zero');
    assert.equal(typeof p.seed, 'number');
  }
  assert.ok(new Set(PLATES.map((p) => p.answer)).size >= 10, 'answers should be varied');
  assert.ok(PLATES.some((p) => p.answer.length === 1) && PLATES.some((p) => p.answer.length === 2));
  assert.equal(new Set(PLATES.map((p) => p.seed)).size, 13);
});

test('generatePlate is deterministic and seed-dependent', () => {
  const def = PLATES[3];
  const a = generatePlate(def);
  const b = generatePlate(def);
  assert.deepEqual(a, b);
  const c = generatePlate({ ...def, seed: def.seed + 1 });
  assert.notDeepEqual(a.dots, c.dots);
  assert.equal(a.size, 480);
  assert.equal(generatePlate(def, 300).size, 300);
});

test('dots lie inside the circle, do not overlap, vary in size, and cover the plate', () => {
  for (const def of PLATES) {
    for (const size of [480, 320]) {
      const plate = generatePlate(def, size);
      const c = size / 2;
      assert.ok(plate.dots.length > 300, `${def.id}: only ${plate.dots.length} dots`);
      let area = 0;
      for (const d of plate.dots) {
        assert.ok(Math.hypot(d.x - c, d.y - c) + d.r <= c + 1e-9, `${def.id}: dot outside circle`);
        assert.ok(d.r > 0);
        for (const v of d.color) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
        area += Math.PI * d.r * d.r;
      }
      assert.ok(area / (Math.PI * c * c) > 0.55, `${def.id}@${size}: coverage ${area / (Math.PI * c * c)}`);
      const radii = plate.dots.map((d) => d.r);
      assert.ok(Math.max(...radii) / Math.min(...radii) >= 1.8, `${def.id}: dot sizes not varied`);
      const dots = plate.dots;
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dist = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
          assert.ok(dist >= dots[i].r + dots[j].r - 1e-6, `${def.id}: dots ${i} and ${j} overlap`);
        }
      }
    }
  }
});

test('figure mask selects a sensible share of dots', () => {
  for (const def of PLATES) {
    const plate = generatePlate(def);
    const fig = plate.dots.filter((d) => isFigurePoint(def, d.x, d.y, plate.size)).length;
    const share = fig / plate.dots.length;
    assert.ok(share > 0.08 && share < 0.5, `${def.id}: figure share ${share}`);
  }
});

test('rasterizePlate returns an opaque RGBA raster of the plate', () => {
  const plate = generatePlate(PLATES[0], 200);
  const img = rasterizePlate(plate);
  assert.equal(img.width, 200);
  assert.equal(img.height, 200);
  assert.ok(img.data instanceof Uint8ClampedArray);
  assert.equal(img.data.length, 200 * 200 * 4);
  for (let i = 3; i < img.data.length; i += 4) assert.equal(img.data[i], 255);
  // Corner pixel is the paper background; each dot centre carries the dot colour.
  assert.deepEqual([...img.data.slice(0, 3)], plate.background);
  for (const d of plate.dots.slice(0, 50)) {
    const i = (Math.floor(d.y) * 200 + Math.floor(d.x)) * 4;
    assert.deepEqual([...img.data.slice(i, i + 3)], d.color);
  }
});

test('vendored palettes are reproduced by the derivation code (not hand-picked)', () => {
  assert.deepEqual(derivePalettes(), PALETTES);
});

/** Separability of figure vs background dots, read back from a simulated raster. */
function measure(def) {
  const plate = generatePlate(def);
  const img = rasterizePlate(plate);
  const out = {};
  for (const [name, type] of VIEWS) {
    const data = simulateImageData(img.data, type, type ? 1 : 0);
    const fig = [];
    const bg = [];
    for (const d of plate.dots) {
      const i = (Math.floor(d.y) * img.width + Math.floor(d.x)) * 4;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      (isFigurePoint(def, d.x, d.y, plate.size) ? fig : bg).push(rgb);
    }
    out[name] = separability(fig, bg);
  }
  return out;
}

const results = new Map();
for (const def of PLATES) {
  test(`plate ${def.id} (${def.kind}, "${def.answer}"): separability under simulated vision`, () => {
    const s = measure(def);
    results.set(def.id, s);
    assert.ok(s.normal >= SEP_VISIBLE, `normal ${s.normal}`);
    if (def.kind === 'control') {
      for (const [name] of VIEWS) assert.ok(s[name] >= SEP_VISIBLE, `control under ${name}: ${s[name]}`);
    }
    for (const name of HIDDEN_FOR[def.kind]) {
      assert.ok(s[name] <= SEP_HIDDEN, `${name} should not see it: ${s[name]}`);
    }
    if (def.kind === 'protan') {
      assert.ok(s.deutan >= 1.5 * s.protan && s.deutan - s.protan >= 1, `protan plate: deutan ${s.deutan} vs protan ${s.protan}`);
    }
    if (def.kind === 'deutan') {
      assert.ok(s.protan >= 1.5 * s.deutan && s.protan - s.deutan >= 1, `deutan plate: protan ${s.protan} vs deutan ${s.deutan}`);
    }
  });
}

test('separability report', () => {
  const rows = PLATES.map((d) => {
    const s = results.get(d.id) ?? measure(d);
    return [d.id, d.kind, d.answer, ...VIEWS.map(([n]) => s[n].toFixed(2))].join('\t');
  });
  console.log(['# id\tkind\tanswer\t' + VIEWS.map(([n]) => n).join('\t'), ...rows.map((r) => '# ' + r)].join('\n'));
});
