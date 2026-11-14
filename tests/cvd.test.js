import test from 'node:test';
import assert from 'node:assert/strict';
import { CVD_TYPES, PRESETS, simulateRGB, simulateImageData } from '../src/core/cvd.js';
import { srgbToLinear, srgbToLab } from '../src/core/color.js';
import { rng, labDistance } from './helpers.js';

const SEVERITIES = [0.1, 0.25, 0.5, 0.6, 0.65, 0.85, 1];

function randomImage(pixels, seed) {
  const r = rng(seed);
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(r() * 256);
  return data;
}

test('CVD_TYPES and PRESETS have the published shape and order', () => {
  assert.deepEqual(CVD_TYPES, ['protan', 'deutan', 'tritan', 'achroma']);
  assert.deepEqual(PRESETS.map((p) => p.id), [
    'normal', 'protanomaly', 'protanopia', 'deuteranomaly', 'deuteranopia',
    'tritanomaly', 'tritanopia', 'achromatomaly', 'achromatopsia',
  ]);
  for (const p of PRESETS) {
    assert.ok(p.type === null || CVD_TYPES.includes(p.type));
    assert.ok(p.severity >= 0 && p.severity <= 1);
  }
});

test('severity 0 and type null are the identity (simulateRGB)', () => {
  for (let r = 0; r <= 255; r += 15) {
    for (let g = 0; g <= 255; g += 15) {
      for (let b = 0; b <= 255; b += 15) {
        const c = [r, g, b];
        assert.deepEqual(simulateRGB(c, null, 1), c);
        assert.deepEqual(simulateRGB(c, null, 0), c);
        for (const t of CVD_TYPES) assert.deepEqual(simulateRGB(c, t, 0), c);
      }
    }
  }
});

test('severity 0 and type null are an exact copy (simulateImageData)', () => {
  const data = randomImage(5000, 7);
  for (const [t, s] of [[null, 1], [null, 0], ...CVD_TYPES.map((t) => [t, 0])]) {
    const out = simulateImageData(data, t, s);
    assert.notEqual(out, data);
    assert.ok(out instanceof Uint8ClampedArray);
    assert.deepEqual(out, data);
  }
});

test('greys stay grey for every type and several severities', () => {
  for (const t of CVD_TYPES) {
    for (const s of SEVERITIES) {
      for (let v = 0; v <= 255; v += 5) {
        const [r, g, b] = simulateRGB([v, v, v], t, s);
        assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 1, `${t}@${s} grey ${v} -> ${r},${g},${b}`);
        assert.ok(Math.abs(r - v) <= 1, `${t}@${s} grey ${v} changed level -> ${r}`);
      }
    }
  }
});

test('output stays within 0..255 integers for a grid of inputs', () => {
  const levels = [0, 1, 32, 64, 100, 128, 160, 200, 254, 255];
  for (const t of CVD_TYPES) {
    for (const s of SEVERITIES) {
      for (const r of levels) for (const g of levels) for (const b of levels) {
        const out = simulateRGB([r, g, b], t, s);
        assert.equal(out.length, 3);
        for (const v of out) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255, `${t}@${s} ${[r, g, b]} -> ${out}`);
      }
    }
  }
});

test('continuous severity interpolates between neighbouring steps', () => {
  const r = rng(11);
  for (const t of CVD_TYPES) {
    for (let i = 0; i < 200; i++) {
      const c = [0, 0, 0].map(() => Math.floor(r() * 256));
      const lo = simulateRGB(c, t, 0.6);
      const mid = simulateRGB(c, t, 0.65);
      const hi = simulateRGB(c, t, 0.7);
      for (let k = 0; k < 3; k++) {
        assert.ok(mid[k] >= Math.min(lo[k], hi[k]) - 1 && mid[k] <= Math.max(lo[k], hi[k]) + 1,
          `${t} ${c}: ${lo} / ${mid} / ${hi}`);
      }
    }
  }
});

test('achroma at severity 1 is a pure grey ordered by linear-light luminance', () => {
  const r = rng(5);
  for (let i = 0; i < 500; i++) {
    const c = [0, 0, 0].map(() => Math.floor(r() * 256));
    const [a, b, d] = simulateRGB(c, 'achroma', 1);
    assert.ok(a === b && b === d, `${c} -> ${a},${b},${d}`);
  }
  const red = simulateRGB([255, 0, 0], 'achroma', 1)[0];
  const green = simulateRGB([0, 255, 0], 'achroma', 1)[0];
  const blue = simulateRGB([0, 0, 255], 'achroma', 1)[0];
  assert.ok(green > red && red > blue);
});

test('simulation is additive in linear light, not on gamma-encoded values', () => {
  // A matrix applied in linear RGB is additive in linear light:
  //   lin(sim(red + blue)) == lin(sim(red)) + lin(sim(blue)).
  // The same matrix applied to gamma-encoded values would violate this badly.
  // Tritan (Brettel) is piecewise linear (two half-planes), so it is excluded.
  const lin = (c) => c.map(srgbToLinear);
  let checked = 0;
  for (const t of ['protan', 'deutan', 'achroma']) {
    for (const [x, y] of [[[255, 0, 0], [0, 0, 255]], [[200, 0, 0], [0, 200, 0]], [[0, 180, 0], [0, 0, 230]]]) {
      const xy = x.map((v, i) => v + y[i]);
      const a = lin(simulateRGB(x, t, 1));
      const b = lin(simulateRGB(y, t, 1));
      const both = lin(simulateRGB(xy, t, 1));
      for (let k = 0; k < 3; k++) {
        // Skip channels where clipping happened; additivity cannot hold there.
        if ([a[k], b[k], both[k]].some((v) => v <= 0 || v >= 1)) continue;
        checked++;
        // Tolerance covers 8-bit quantisation of three values (about 0.0045 each near 1.0).
        assert.ok(Math.abs(both[k] - (a[k] + b[k])) < 0.02, `${t} ${x}+${y} ch${k}: ${both[k]} vs ${a[k] + b[k]}`);
      }
    }
  }
  assert.ok(checked >= 12, `only ${checked} unclipped channels checked`);
});

/**
 * Derive a confusion pair for `type` by brute-force search over an sRGB grid:
 * the pair with the smallest simulated difference under `type` among pairs that
 * differ by at least MIN_NORMAL_DE for normal vision. Nothing is hard-coded.
 */
function deriveConfusionPair(type) {
  const MIN_NORMAL_DE = 25;
  const colors = [];
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) colors.push([r, g, b]);
  const normal = colors.map((c) => srgbToLab(c));
  const sim = colors.map((c) => srgbToLab(simulateRGB(c, type, 1)));
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const ds = labDistance(sim[i], sim[j]);
      if (ds >= bestD) continue;
      if (labDistance(normal[i], normal[j]) < MIN_NORMAL_DE) continue;
      bestD = ds;
      best = [colors[i], colors[j]];
    }
  }
  return best;
}

for (const type of ['protan', 'deutan', 'tritan']) {
  test(`a computed ${type} confusion pair collapses under ${type} only`, () => {
    const [a, b] = deriveConfusionPair(type);
    const de = (t) => labDistance(srgbToLab(simulateRGB(a, t, 1)), srgbToLab(simulateRGB(b, t, 1)));
    const own = de(type);
    const normal = labDistance(srgbToLab(a), srgbToLab(b));
    const others = CVD_TYPES.filter((t) => t !== type && t !== 'achroma').map(de);
    assert.ok(own < 3, `${type} pair ${a} / ${b}: own dE ${own}`);
    assert.ok(normal >= 25 && normal > 8 * own, `normal dE ${normal} vs own ${own}`);
    assert.ok(Math.max(...others) > Math.max(10, 4 * own), `other types dE ${others} vs own ${own}`);
  });
}

test('simulateImageData preserves alpha, returns a new array and matches simulateRGB', () => {
  const data = randomImage(4096, 99);
  const before = data.slice();
  for (const t of CVD_TYPES) {
    for (const s of [0.37, 0.6, 1]) {
      const out = simulateImageData(data, t, s);
      assert.notEqual(out, data);
      assert.ok(out instanceof Uint8ClampedArray);
      assert.equal(out.length, data.length);
      for (let i = 0; i < data.length; i += 4) {
        assert.equal(out[i + 3], data[i + 3]);
        const expected = simulateRGB([data[i], data[i + 1], data[i + 2]], t, s);
        assert.deepEqual([out[i], out[i + 1], out[i + 2]], expected, `${t}@${s} pixel ${i / 4}`);
      }
    }
  }
  assert.deepEqual(data, before, 'input must not be modified');
});

test('simulateImageData handles ~2.5 megapixels well under 100 ms', () => {
  const pixels = 1920 * 1300;
  const data = randomImage(pixels, 3);
  const timings = {};
  for (const t of CVD_TYPES) {
    simulateImageData(data, t, 0.6); // warm-up (JIT, LUT build)
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      simulateImageData(data, t, 0.6);
      best = Math.min(best, performance.now() - t0);
    }
    timings[t] = Math.round(best);
    assert.ok(best < 100, `${t}: best of 3 = ${best.toFixed(1)} ms`);
  }
  console.log('# simulateImageData 2.5 MP best-of-3 (ms):', JSON.stringify(timings));
});
