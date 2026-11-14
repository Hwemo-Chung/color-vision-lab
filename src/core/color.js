// Colour-space helpers. Pure functions, no DOM, run unchanged in browsers and Node.
//
// sRGB transfer function: IEC 61966-2-1 (the piecewise curve with the 0.04045 /
// 0.0031308 breakpoints). CIELAB: CIE 1976 L*a*b* relative to the D65 white of
// sRGB, using the sRGB (Rec. 709 primaries) linear-RGB -> XYZ matrix.

/** Exact sRGB decode for an 8-bit level, as a 256-entry table. */
export const DECODE = new Float64Array(256);
for (let v = 0; v < 256; v++) {
  const c = v / 255;
  DECODE[v] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** v: integer 0..255 -> linear-light value 0..1. */
export function srgbToLinear(v) {
  const i = v | 0;
  return DECODE[i < 0 ? 0 : i > 255 ? 255 : i];
}

/** x: linear-light value (clamped to 0..1) -> integer sRGB level 0..255 (rounded). */
export function linearToSrgb(x) {
  if (!(x > 0)) return 0; // also catches NaN
  if (x >= 1) return 255;
  const c = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

/**
 * Encode table used by the fast pixel paths: index = round(x * ENCODE_SCALE).
 * 2^16 bins are fine enough that the table agrees with linearToSrgb() for every
 * one of the 256 decoded levels (the steepest part of the curve, near 0, spends
 * about 20 bins per sRGB level).
 */
export const ENCODE_SCALE = 65535;
export const ENCODE = new Uint8Array(ENCODE_SCALE + 1);
for (let i = 0; i <= ENCODE_SCALE; i++) ENCODE[i] = linearToSrgb(i / ENCODE_SCALE);

/** Linear-light value -> sRGB level via the encode table (same clamp as linearToSrgb). */
export function encodeFast(x) {
  if (!(x > 0)) return 0;
  if (x >= 1) return 255;
  return ENCODE[(x * ENCODE_SCALE + 0.5) | 0];
}

// Rec. 709 / sRGB linear RGB -> CIE XYZ (D65).
const M_XYZ = [
  [0.4124, 0.3576, 0.1805],
  [0.2126, 0.7152, 0.0722],
  [0.0193, 0.1192, 0.9505],
];
const WHITE = M_XYZ.map((row) => row[0] + row[1] + row[2]);

/** Relative luminance Y (0..1) of an sRGB colour, Rec. 709 weights in linear light. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map(srgbToLinear);
  return M_XYZ[1][0] * r + M_XYZ[1][1] * g + M_XYZ[1][2] * b;
}

/** Linear RGB triple (numbers, not clamped) -> CIELAB [L, a, b]. */
export function linearToLab(lin) {
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const xyz = M_XYZ.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  const fx = f(xyz[0] / WHITE[0]);
  const fy = f(xyz[1] / WHITE[1]);
  const fz = f(xyz[2] / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** sRGB [r,g,b] (0..255) -> CIELAB [L, a, b]. */
export function srgbToLab(rgb) {
  return linearToLab(rgb.map(srgbToLinear));
}

/** CIE76 colour difference (Euclidean distance in CIELAB) between two sRGB colours. */
export function deltaE(rgb1, rgb2) {
  const p = srgbToLab(rgb1);
  const q = srgbToLab(rgb2);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
