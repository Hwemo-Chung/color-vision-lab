import test from 'node:test';
import assert from 'node:assert/strict';
import { srgbToLinear, linearToSrgb, srgbToLab, deltaE } from '../src/core/color.js';

test('sRGB -> linear -> sRGB round trip is exact for all 256 values', () => {
  for (let v = 0; v <= 255; v++) {
    assert.equal(linearToSrgb(srgbToLinear(v)), v, `value ${v}`);
  }
});

test('srgbToLinear maps 0..255 monotonically onto 0..1', () => {
  assert.equal(srgbToLinear(0), 0);
  assert.equal(srgbToLinear(255), 1);
  for (let v = 1; v <= 255; v++) assert.ok(srgbToLinear(v) > srgbToLinear(v - 1));
  // The sRGB curve is not the identity: mid-grey is well below 0.5 in linear light.
  assert.ok(srgbToLinear(128) < 0.4);
});

test('linearToSrgb clamps out-of-range input and returns integers', () => {
  assert.equal(linearToSrgb(-0.5), 0);
  assert.equal(linearToSrgb(1.7), 255);
  assert.equal(linearToSrgb(Number.NaN), 0);
  for (let i = 0; i <= 100; i++) assert.ok(Number.isInteger(linearToSrgb(i / 100)));
});

test('CIELAB helpers: white is L=100 neutral, greys are neutral, deltaE is a metric', () => {
  const white = srgbToLab([255, 255, 255]);
  assert.ok(Math.abs(white[0] - 100) < 0.01);
  for (const v of [0, 50, 128, 200, 255]) {
    const [, a, b] = srgbToLab([v, v, v]);
    assert.ok(Math.abs(a) < 0.01 && Math.abs(b) < 0.01, `grey ${v} -> a=${a} b=${b}`);
  }
  assert.equal(deltaE([10, 20, 30], [10, 20, 30]), 0);
  assert.ok(deltaE([255, 0, 0], [0, 255, 0]) > deltaE([255, 0, 0], [250, 10, 0]));
  assert.equal(deltaE([1, 2, 3], [200, 100, 50]), deltaE([200, 100, 50], [1, 2, 3]));
});
