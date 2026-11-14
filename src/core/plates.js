// Procedural pseudo-isochromatic plates. Pure JS, no DOM or canvas.
//
// Nothing here is copied from Ishihara plates: dot layouts come from seeded
// dart-throwing inside a circle, digits from the stroke font below, and the
// colour pairs from derive-palettes.js (computed with our own simulator).
//
// Geometry is generated in normalised units (plate radius = 1, centre at 0,0)
// and only scaled to pixels at the end, so a definition gives the same plate at
// any `size`.

import { srgbToLinear, linearToSrgb } from './color.js';
import { mulberry32 } from './random.js';
import { PALETTES, JITTER_MIN, JITTER_MAX } from './palettes.js';

export { PALETTES, JITTER_MIN, JITTER_MAX };

/**
 * 13 plates: 1 control, 4 red-green, 3 protan, 3 deutan, 2 tritan.
 * `kind` says who should NOT see the figure: redgreen -> protan and deutan,
 * protan -> protan (deutan still sees it), deutan -> deutan, tritan -> tritan.
 * The control plate is readable for everyone.
 */
export const PLATES = [
  { id: 'plate-01', kind: 'control',  answer: '12', seed: 4001 },
  { id: 'plate-02', kind: 'redgreen', answer: '74', seed: 4102 },
  { id: 'plate-03', kind: 'protan',   answer: '42', seed: 4203 },
  { id: 'plate-04', kind: 'deutan',   answer: '57', seed: 4304 },
  { id: 'plate-05', kind: 'redgreen', answer: '6',  seed: 4405 },
  { id: 'plate-06', kind: 'tritan',   answer: '27', seed: 4506 },
  { id: 'plate-07', kind: 'protan',   answer: '3',  seed: 4607 },
  { id: 'plate-08', kind: 'deutan',   answer: '9',  seed: 4708 },
  { id: 'plate-09', kind: 'redgreen', answer: '29', seed: 4809 },
  { id: 'plate-10', kind: 'protan',   answer: '86', seed: 4910 },
  { id: 'plate-11', kind: 'deutan',   answer: '63', seed: 5011 },
  { id: 'plate-12', kind: 'tritan',   answer: '4',  seed: 5113 },
  { id: 'plate-13', kind: 'redgreen', answer: '5',  seed: 5213 },
];

/** Paper colour around and between the dots. */
export const PAPER = [246, 243, 236];

// ---------------------------------------------------------------------------
// Stroke font: each digit is a set of polylines in a 1 x 1.6 box (y down).
// The figure is every point within STROKE_HALF_WIDTH of a polyline.

const GLYPH_W = 1;
const GLYPH_H = 1.6;
const STROKE_HALF_WIDTH = 0.15;

/** Points on an ellipse arc from angle t0 to t1 (degrees; 0 = right, 90 = down). */
function arc(cx, cy, rx, ry, t0, t1, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = ((t0 + ((t1 - t0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return pts;
}
const flip = (lines) => lines.map((l) => l.map(([x, y]) => [GLYPH_W - x, GLYPH_H - y]));

const SIX = [
  [...arc(0.5, 0.8, 0.38, 0.66, -50, -180), [0.12, 1.12]],
  arc(0.5, 1.12, 0.38, 0.34, 0, 360, 28),
];

export const GLYPHS = {
  0: [arc(0.5, 0.8, 0.38, 0.66, 0, 360, 36)],
  1: [[[0.28, 0.38], [0.56, 0.14], [0.56, 1.46]]],
  2: [[...arc(0.5, 0.48, 0.36, 0.34, -170, 30), [0.12, 1.46], [0.9, 1.46]]],
  3: [arc(0.5, 0.45, 0.34, 0.31, -160, 90), arc(0.5, 1.1, 0.38, 0.35, -90, 160)],
  4: [[[0.68, 1.46], [0.68, 0.14], [0.1, 1.06], [0.92, 1.06]]],
  5: [[[0.86, 0.14], [0.22, 0.14], [0.16, 0.74], ...arc(0.48, 1.06, 0.38, 0.4, -130, 150)]],
  6: SIX,
  7: [[[0.1, 0.14], [0.9, 0.14], [0.4, 1.46]]],
  8: [arc(0.5, 0.45, 0.31, 0.31, 0, 360, 28), arc(0.5, 1.1, 0.37, 0.35, 0, 360, 28)],
  9: flip(SIX),
};

/** Glyph-unit size (normalised plate units per glyph unit) and spacing. */
const UNIT_TWO = 0.5;
const UNIT_ONE = 0.6;
const DIGIT_GAP = 0.3;

const segmentCache = new Map();

/** Line segments of the answer's figure, in normalised plate coordinates. */
function figureSegments(answer) {
  let segs = segmentCache.get(answer);
  if (segs) return segs;
  const digits = String(answer).split('');
  const u = digits.length > 1 ? UNIT_TWO : UNIT_ONE;
  const totalW = digits.length * GLYPH_W + (digits.length - 1) * DIGIT_GAP;
  segs = [];
  digits.forEach((d, k) => {
    const lines = GLYPHS[d];
    if (!lines) throw new RangeError(`No glyph for "${d}"`);
    const ox = -totalW / 2 + k * (GLYPH_W + DIGIT_GAP);
    const oy = -GLYPH_H / 2;
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const [x1, y1] = line[i - 1];
        const [x2, y2] = line[i];
        segs.push([(ox + x1) * u, (oy + y1) * u, (ox + x2) * u, (oy + y2) * u]);
      }
    }
  });
  segs.halfWidth = STROKE_HALF_WIDTH * u;
  segmentCache.set(answer, segs);
  return segs;
}

function distToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function inFigureNormalised(answer, nx, ny) {
  const segs = figureSegments(answer);
  for (const s of segs) if (distToSegment(nx, ny, s) <= segs.halfWidth) return true;
  return false;
}

/**
 * Does the canvas point (x, y) of a plate of `size` px fall inside the figure
 * (the digits)? Dots are assigned to the figure by their centre.
 */
export function isFigurePoint(def, x, y, size = 480) {
  const c = size / 2;
  return inFigureNormalised(def.answer, (x - c) / c, (y - c) / c);
}

// ---------------------------------------------------------------------------
// Dot packing: seeded dart throwing in passes of decreasing dot size, with a
// spatial hash for the overlap test. Normalised units, plate radius 1.

const PACK_RADIUS = 0.97; // dots stay inside this radius (leaves a thin rim)
const DOT_GAP = 0.004;    // minimum clearance between dots
const PASSES = [
  // [min radius, max radius, attempts]
  [0.034, 0.045, 3000],
  [0.025, 0.034, 6000],
  [0.018, 0.025, 12000],
  [0.012, 0.018, 20000],
  [0.007, 0.012, 20000],
];

function packDots(rand) {
  const cell = 2 * PASSES[0][1] + DOT_GAP;
  const n = Math.ceil((2 * PACK_RADIUS) / cell) + 1;
  const grid = Array.from({ length: n * n }, () => []);
  const dots = [];
  const cellOf = (v) => Math.min(n - 1, Math.max(0, Math.floor((v + PACK_RADIUS) / cell)));
  for (const [rMin, rMax, attempts] of PASSES) {
    for (let a = 0; a < attempts; a++) {
      const r = rMin + rand() * (rMax - rMin);
      const reach = PACK_RADIUS - r;
      const rho = reach * Math.sqrt(rand());
      const theta = rand() * 2 * Math.PI;
      const x = rho * Math.cos(theta);
      const y = rho * Math.sin(theta);
      const cx = cellOf(x);
      const cy = cellOf(y);
      let ok = true;
      for (let gy = Math.max(0, cy - 1); ok && gy <= Math.min(n - 1, cy + 1); gy++) {
        for (let gx = Math.max(0, cx - 1); ok && gx <= Math.min(n - 1, cx + 1); gx++) {
          for (const d of grid[gy * n + gx]) {
            const min = d.r + r + DOT_GAP;
            const ddx = d.x - x;
            const ddy = d.y - y;
            if (ddx * ddx + ddy * ddy < min * min) { ok = false; break; }
          }
        }
      }
      if (!ok) continue;
      const dot = { x, y, r };
      dots.push(dot);
      grid[cy * n + cx].push(dot);
    }
  }
  return dots;
}

/** Scale an sRGB colour by `f` in linear light (luminance jitter). */
function scaleLinear(rgb, f) {
  return rgb.map((v) => linearToSrgb(srgbToLinear(v) * f));
}

/**
 * Deterministic plate for a definition: { size, background, dots: [{x, y, r, color}] }
 * in canvas pixel coordinates (origin top-left, plate circle inscribed in the square).
 */
export function generatePlate(def, size = 480) {
  const pairs = PALETTES[def.kind];
  if (!pairs) throw new RangeError(`Unknown plate kind: ${def.kind}`);
  const seed = def.seed >>> 0;
  // Palette variant and figure/background role come straight from the seed.
  const variant = seed % pairs.length;
  const swap = Math.floor(seed / pairs.length) % 2 === 1;
  const [a, b] = pairs[variant];
  const figure = swap ? b : a;
  const ground = swap ? a : b;

  const rand = mulberry32(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b));
  const c = size / 2;
  const dots = packDots(rand).map((d) => {
    const base = inFigureNormalised(def.answer, d.x, d.y) ? figure : ground;
    const f = JITTER_MIN + rand() * (JITTER_MAX - JITTER_MIN);
    return { x: c + d.x * c, y: c + d.y * c, r: d.r * c, color: scaleLinear(base, f) };
  });
  return { size, background: PAPER.slice(), dots };
}

/**
 * Pure-JS RGBA raster of a plate (hard-edged dots, opaque). A pixel belongs to a
 * dot when its centre lies inside the dot. Returns { width, height, data }.
 */
export function rasterizePlate(plate) {
  const w = Math.round(plate.size);
  const h = w;
  const data = new Uint8ClampedArray(w * h * 4);
  const [pr, pg, pb] = plate.background;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = pr;
    data[i + 1] = pg;
    data[i + 2] = pb;
    data[i + 3] = 255;
  }
  for (const d of plate.dots) {
    const [r, g, b] = d.color;
    const y0 = Math.max(0, Math.floor(d.y - d.r));
    const y1 = Math.min(h - 1, Math.ceil(d.y + d.r));
    const x0 = Math.max(0, Math.floor(d.x - d.r));
    const x1 = Math.min(w - 1, Math.ceil(d.x + d.r));
    const r2 = d.r * d.r;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - d.y;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - d.x;
        if (dx * dx + dy * dy > r2) continue;
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }
  }
  return { width: w, height: h, data };
}
