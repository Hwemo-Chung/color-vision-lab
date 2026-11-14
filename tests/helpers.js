// Shared helpers for the test suite (not a test file itself).
import { srgbToLab } from '../src/core/color.js';

/** Small seeded PRNG for reproducible test inputs (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function labDistance(p, q) {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * Figure/background separability of a set of coloured samples.
 *   sep = |mean(F) - mean(B)| / sqrt((var(F) + var(B)) / 2)
 * in CIELAB, where var(G) is the mean squared Lab distance of the group's
 * samples to the group mean. 0 means the two groups are statistically
 * indistinguishable in mean colour; large values mean the group means are far
 * apart relative to the dot-to-dot jitter inside each group.
 */
export function separability(figureRgbs, backgroundRgbs) {
  const stats = (rgbs) => {
    const labs = rgbs.map((c) => srgbToLab(c));
    const mean = [0, 0, 0];
    for (const l of labs) for (let i = 0; i < 3; i++) mean[i] += l[i] / labs.length;
    let v = 0;
    for (const l of labs) v += labDistance(l, mean) ** 2;
    return { mean, variance: v / labs.length };
  };
  const f = stats(figureRgbs);
  const b = stats(backgroundRgbs);
  const spread = Math.sqrt((f.variance + b.variance) / 2) || 1e-9;
  return labDistance(f.mean, b.mean) / spread;
}
