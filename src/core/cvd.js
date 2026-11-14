// Colour-vision-deficiency simulation. Pure JS, no DOM: runs in browsers and Node.
//
// Pipeline (always in linear light, never on gamma-encoded values):
//   sRGB 8-bit -> linear RGB (table) -> 3x3 matrix -> clamp 0..1 -> sRGB 8-bit (table)
//
// ---------------------------------------------------------------------------
// Protan / deutan: Machado, Oliveira & Fernandes (2009)
//   G. M. Machado, M. M. Oliveira, L. A. F. Fernandes, "A Physiologically-based
//   Model for Simulation of Color Vision Deficiency", IEEE Transactions on
//   Visualization and Computer Graphics 15(6), 2009, pp. 1291-1298.
//   Table 1 "Simulation matrices", severity 0.0 .. 1.0 in steps of 0.1, from the
//   authors' page:
//     https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
//   The numbers below were extracted from that page by script (not typed by
//   hand) on 2026-11-14 and cross-checked against the copy in DaltonLens-Python
//   (https://github.com/DaltonLens/DaltonLens-Python/blob/master/daltonlens/simulate.py,
//   `machado_2009_matrices`): all 297 coefficients identical.
//   The matrices act on linear RGB (DaltonLens, "Understanding CVD simulation",
//   https://daltonlens.org/understanding-cvd-simulation/). Continuous severity
//   interpolates linearly between the two nearest published steps, which the
//   authors' page describes as "a fast approximation and also very accurate".
//
// Tritan: Brettel, Viénot & Mollon (1997)
//   H. Brettel, F. Viénot, J. D. Mollon, "Computerized simulation of color
//   appearance for dichromats", J. Opt. Soc. Am. A 14(10), 1997, pp. 2647-2655.
//   Chosen over Machado's tritan matrices (also on the page above) because
//   Machado et al.'s tritan simulation is reported to be less accurate than
//   their protan/deutan model.
//   The two half-plane projections and the separation-plane normal, already
//   folded into linear-RGB matrices, are the precomputed values of
//   libDaltonLens (public domain, Nicolas Burrus):
//     https://github.com/DaltonLens/libDaltonLens/blob/master/libDaltonLens.c
//     (`brettel_tritan_params`; per its header: sRGB primaries for linear RGB
//      -> XYZ, Smith & Pokorny 1975 XYZ -> LMS, RGB white as the neutral axis)
//   extracted by script on 2026-11-14. These are a faithful reimplementation of
//   Brettel 1997, not numbers printed in the 1997 paper itself (the paper gives
//   the method and anchor wavelengths, not sRGB matrices). Anomalous severities
//   (< 1) blend linearly between identity and the dichromat projection, as
//   libDaltonLens does; that is an approximation, Brettel models dichromacy only.
//
// Achroma: luminance Y in linear RGB with Rec. 709 / sRGB weights
//   (0.2126, 0.7152, 0.0722; IEC 61966-2-1), blended with the original by severity.
// ---------------------------------------------------------------------------

import { DECODE, ENCODE, ENCODE_SCALE } from './color.js';

export const CVD_TYPES = ['protan', 'deutan', 'tritan', 'achroma'];

export const PRESETS = [
  { id: 'normal',        type: null,      severity: 0 },
  { id: 'protanomaly',   type: 'protan',  severity: 0.6 },
  { id: 'protanopia',    type: 'protan',  severity: 1 },
  { id: 'deuteranomaly', type: 'deutan',  severity: 0.6 },
  { id: 'deuteranopia',  type: 'deutan',  severity: 1 },
  { id: 'tritanomaly',   type: 'tritan',  severity: 0.6 },
  { id: 'tritanopia',    type: 'tritan',  severity: 1 },
  { id: 'achromatomaly', type: 'achroma', severity: 0.6 },
  { id: 'achromatopsia', type: 'achroma', severity: 1 },
];

/** Machado 2009 Table 1, row-major 3x3 per severity step 0.0, 0.1, ..., 1.0. */
export const MACHADO_2009 = {
  protan: [
    [ 1.000000,  0.000000, -0.000000,  0.000000,  1.000000,  0.000000, -0.000000, -0.000000,  1.000000], // 0.0
    [ 0.856167,  0.182038, -0.038205,  0.029342,  0.955115,  0.015544, -0.002880, -0.001563,  1.004443], // 0.1
    [ 0.734766,  0.334872, -0.069637,  0.051840,  0.919198,  0.028963, -0.004928, -0.004209,  1.009137], // 0.2
    [ 0.630323,  0.465641, -0.095964,  0.069181,  0.890046,  0.040773, -0.006308, -0.007724,  1.014032], // 0.3
    [ 0.539009,  0.579343, -0.118352,  0.082546,  0.866121,  0.051332, -0.007136, -0.011959,  1.019095], // 0.4
    [ 0.458064,  0.679578, -0.137642,  0.092785,  0.846313,  0.060902, -0.007494, -0.016807,  1.024301], // 0.5
    [ 0.385450,  0.769005, -0.154455,  0.100526,  0.829802,  0.069673, -0.007442, -0.022190,  1.029632], // 0.6
    [ 0.319627,  0.849633, -0.169261,  0.106241,  0.815969,  0.077790, -0.007025, -0.028051,  1.035076], // 0.7
    [ 0.259411,  0.923008, -0.182420,  0.110296,  0.804340,  0.085364, -0.006276, -0.034346,  1.040622], // 0.8
    [ 0.203876,  0.990338, -0.194214,  0.112975,  0.794542,  0.092483, -0.005222, -0.041043,  1.046265], // 0.9
    [ 0.152286,  1.052583, -0.204868,  0.114503,  0.786281,  0.099216, -0.003882, -0.048116,  1.051998], // 1.0
  ],
  deutan: [
    [ 1.000000,  0.000000, -0.000000,  0.000000,  1.000000,  0.000000, -0.000000, -0.000000,  1.000000], // 0.0
    [ 0.866435,  0.177704, -0.044139,  0.049567,  0.939063,  0.011370, -0.003453,  0.007233,  0.996220], // 0.1
    [ 0.760729,  0.319078, -0.079807,  0.090568,  0.889315,  0.020117, -0.006027,  0.013325,  0.992702], // 0.2
    [ 0.675425,  0.433850, -0.109275,  0.125303,  0.847755,  0.026942, -0.007950,  0.018572,  0.989378], // 0.3
    [ 0.605511,  0.528560, -0.134071,  0.155318,  0.812366,  0.032316, -0.009376,  0.023176,  0.986200], // 0.4
    [ 0.547494,  0.607765, -0.155259,  0.181692,  0.781742,  0.036566, -0.010410,  0.027275,  0.983136], // 0.5
    [ 0.498864,  0.674741, -0.173604,  0.205199,  0.754872,  0.039929, -0.011131,  0.030969,  0.980162], // 0.6
    [ 0.457771,  0.731899, -0.189670,  0.226409,  0.731012,  0.042579, -0.011595,  0.034333,  0.977261], // 0.7
    [ 0.422823,  0.781057, -0.203881,  0.245752,  0.709602,  0.044646, -0.011843,  0.037423,  0.974421], // 0.8
    [ 0.392952,  0.823610, -0.216562,  0.263559,  0.690210,  0.046232, -0.011910,  0.040281,  0.971630], // 0.9
    [ 0.367322,  0.860646, -0.227968,  0.280085,  0.672501,  0.047413, -0.011820,  0.042940,  0.968881], // 1.0
  ],
};

/** Brettel 1997 tritan parameters in linear RGB (libDaltonLens precomputation). */
export const BRETTEL_1997_TRITAN = {
  rgbCvdFromRgb1: [1.01277, 0.13548, -0.14826, -0.01243, 0.86812, 0.14431, 0.07589, 0.80500, 0.11911],
  rgbCvdFromRgb2: [0.93678, 0.18979, -0.12657, 0.06154, 0.81526, 0.12320, -0.37562, 1.12767, 0.24796],
  separationPlaneNormalInRgb: [0.03901, -0.02788, -0.01113],
};

/** Rec. 709 / sRGB luminance weights for linear RGB. */
export const REC709_Y = [0.2126, 0.7152, 0.0722];

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function lerp9(a, b, w) {
  const out = new Array(9);
  for (let i = 0; i < 9; i++) out[i] = a[i] + (b[i] - a[i]) * w;
  return out;
}

function clampSeverity(s) {
  const n = Number(s);
  return n > 0 ? (n < 1 ? n : 1) : 0;
}

/**
 * The simulation kernel for (type, severity): one linear-RGB matrix, or for
 * Brettel tritan two matrices plus the plane that picks between them.
 * Returns null for the identity (type null or severity 0).
 */
export function cvdKernel(type, severity) {
  const s = clampSeverity(severity);
  if (type == null || s === 0) return null;
  switch (type) {
    case 'protan':
    case 'deutan': {
      const steps = MACHADO_2009[type];
      const x = s * 10;
      const lo = Math.floor(x);
      const hi = Math.min(lo + 1, 10);
      return { m1: lerp9(steps[lo], steps[hi], x - lo), m2: null, n: null };
    }
    case 'tritan': {
      const p = BRETTEL_1997_TRITAN;
      return {
        m1: lerp9(IDENTITY, p.rgbCvdFromRgb1, s),
        m2: lerp9(IDENTITY, p.rgbCvdFromRgb2, s),
        n: p.separationPlaneNormalInRgb,
      };
    }
    case 'achroma': {
      const y = REC709_Y;
      return { m1: lerp9(IDENTITY, [...y, ...y, ...y], s), m2: null, n: null };
    }
    default:
      throw new TypeError(`Unknown CVD type: ${type}`);
  }
}

/**
 * Compiled kernel: every matrix coefficient is folded into a 256-entry integer
 * table, T[v] = round(m * linear(v) * ENCODE_SCALE), so the per-pixel work is
 * table lookups and integer adds. The sum indexes the 2^16-bin encode table
 * directly. Rounding error is at most 1.5 bins (about 1/40000 in linear light),
 * far below one 8-bit sRGB step anywhere on the curve.
 */
const compiledCache = new Map();

function tablesFor(m) {
  const t = [];
  for (let k = 0; k < 9; k++) {
    const tab = new Int32Array(256);
    for (let v = 0; v < 256; v++) tab[v] = Math.round(m[k] * DECODE[v] * ENCODE_SCALE);
    t.push(tab);
  }
  return t;
}

function compile(type, severity) {
  const s = clampSeverity(severity);
  if (type == null || s === 0) return null;
  const key = `${type}|${s}`;
  let c = compiledCache.get(key);
  if (c) return c;
  const kernel = cvdKernel(type, s);
  c = { a: tablesFor(kernel.m1), b: kernel.m2 ? tablesFor(kernel.m2) : null, n: kernel.n };
  if (compiledCache.size > 64) compiledCache.clear();
  compiledCache.set(key, c);
  return c;
}

/**
 * Core loop shared by simulateRGB and simulateImageData so both give
 * bit-identical results. `src`/`dst` are byte arrays with `stride` bytes per pixel.
 */
function run(c, src, dst, count, stride) {
  const D = DECODE;
  const E = ENCODE;
  const K = ENCODE_SCALE;
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = c.a;
  const two = c.b !== null;
  const [b0, b1, b2, b3, b4, b5, b6, b7, b8] = two ? c.b : c.a;
  const n0 = two ? c.n[0] : 0;
  const n1 = two ? c.n[1] : 0;
  const n2 = two ? c.n[2] : 0;
  for (let p = 0, i = 0; p < count; p++, i += stride) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    let x;
    let y;
    let z;
    if (two && D[r] * n0 + D[g] * n1 + D[b] * n2 < 0) {
      x = b0[r] + b1[g] + b2[b];
      y = b3[r] + b4[g] + b5[b];
      z = b6[r] + b7[g] + b8[b];
    } else {
      x = a0[r] + a1[g] + a2[b];
      y = a3[r] + a4[g] + a5[b];
      z = a6[r] + a7[g] + a8[b];
    }
    dst[i] = x > 0 ? (x < K ? E[x] : 255) : 0;
    dst[i + 1] = y > 0 ? (y < K ? E[y] : 255) : 0;
    dst[i + 2] = z > 0 ? (z < K ? E[z] : 255) : 0;
  }
}

/**
 * rgb: [r,g,b] integers 0..255; type: one of CVD_TYPES or null; severity 0..1.
 * Returns a new [r,g,b] of integers 0..255.
 */
export function simulateRGB(rgb, type, severity) {
  const src = [clampByte(rgb[0]), clampByte(rgb[1]), clampByte(rgb[2])];
  const c = compile(type, severity);
  if (!c) return src;
  // Run through the same typed-array loop as simulateImageData (keeps `run`
  // monomorphic, which matters for the image path's speed).
  PIXEL_IN[0] = src[0];
  PIXEL_IN[1] = src[1];
  PIXEL_IN[2] = src[2];
  run(c, PIXEL_IN, PIXEL_OUT, 1, 4);
  return [PIXEL_OUT[0], PIXEL_OUT[1], PIXEL_OUT[2]];
}
const PIXEL_IN = new Uint8Array(4);
const PIXEL_OUT = new Uint8Array(4);

/**
 * data: Uint8ClampedArray of RGBA pixels. Returns a NEW Uint8ClampedArray of the
 * same length; alpha is copied through unchanged. Identity cases return a copy.
 */
export function simulateImageData(data, type, severity) {
  const out = new Uint8ClampedArray(data);
  const c = compile(type, severity);
  if (!c) return out;
  // Plain Uint8Array views: all stored values are already integers in 0..255.
  const src = new Uint8Array(data.buffer, data.byteOffset, data.length);
  const dst = new Uint8Array(out.buffer, out.byteOffset, out.length);
  run(c, src, dst, data.length >> 2, 4);
  return out;
}

function clampByte(v) {
  const n = Math.round(Number(v));
  return n > 0 ? (n < 255 ? n : 255) : 0;
}
