// Scoring for the 13-plate screening set. A screening aid, NOT a diagnosis:
// the rules prefer 'inconclusive' or 'redgreen' over naming protan/deutan on
// thin evidence.
//
// Inputs: [{ plateId, response }], response null = "I can't see a number" and
// counts as wrong. Responses are compared after Unicode NFKC normalisation
// (full-width digits -> ASCII) and removal of all whitespace. Unknown plate ids
// are ignored; each plate counts once (the first answer wins). `correct` and
// `total` include the control plate; `byKind` does not.
//
// Decision rules, with miss = total - correct per kind (full set: 4 red-green,
// 3 protan, 3 deutan, 2 tritan plates):
//   1. Control plate answered wrong            -> 'inconclusive', controlFailed = true.
//   2. Not every plate answered (incomplete)   -> 'inconclusive'.
//   3. Red-green evidence: redgreen miss >= 2 (half of those plates), or
//      protan miss + deutan miss >= 3.
//      Tritan evidence: tritan miss >= 2 (both plates).
//   4. Both kinds of evidence                  -> 'inconclusive' (no single
//      deficiency explains it; e.g. random answers or achromatopsia).
//   5. Red-green evidence only: name a subtype only when the red-green plates
//      themselves were missed (redgreen miss >= 2) AND the subtype plates
//      separate clearly:
//        protan miss >= 2 and protan miss - deutan miss >= 2  -> 'protan'
//        deutan miss >= 2 and deutan miss - protan miss >= 2  -> 'deutan'
//      otherwise                                              -> 'redgreen'.
//   6. Tritan evidence only                    -> 'tritan'.
//   7. No evidence: at most 1 miss over all colour plates -> 'normal';
//      2 or more scattered misses              -> 'inconclusive'.

import { PLATES } from './plates.js';

export const THRESHOLDS = Object.freeze({
  redgreenMiss: 2,
  subtypeMissSum: 3,
  tritanMiss: 2,
  subtypeMin: 2,
  subtypeMargin: 2,
  normalMaxMiss: 1,
});

const BY_ID = new Map(PLATES.map((p) => [p.id, p]));
const KINDS = ['redgreen', 'protan', 'deutan', 'tritan'];

export function normaliseResponse(response) {
  if (response === null || response === undefined) return null;
  const s = String(response).normalize('NFKC').replace(/\s+/g, '');
  return s === '' ? null : s;
}

export function scoreAnswers(answers) {
  const byKind = Object.fromEntries(KINDS.map((k) => [k, { correct: 0, total: 0 }]));
  const seen = new Set();
  let correct = 0;
  let total = 0;
  let controlAnswered = false;
  let controlFailed = false;

  for (const a of answers ?? []) {
    const plate = a && BY_ID.get(a.plateId);
    if (!plate || seen.has(plate.id)) continue;
    seen.add(plate.id);
    const ok = normaliseResponse(a.response) === plate.answer;
    total++;
    if (ok) correct++;
    if (plate.kind === 'control') {
      controlAnswered = true;
      controlFailed = !ok;
    } else {
      byKind[plate.kind].total++;
      if (ok) byKind[plate.kind].correct++;
    }
  }

  const result = (verdict) => ({ verdict, controlFailed, correct, total, byKind });
  if (controlFailed) return result('inconclusive');
  if (!controlAnswered || seen.size < PLATES.length) return result('inconclusive');

  const miss = Object.fromEntries(KINDS.map((k) => [k, byKind[k].total - byKind[k].correct]));
  const T = THRESHOLDS;
  const redgreenEvidence = miss.redgreen >= T.redgreenMiss || miss.protan + miss.deutan >= T.subtypeMissSum;
  const tritanEvidence = miss.tritan >= T.tritanMiss;

  if (redgreenEvidence && tritanEvidence) return result('inconclusive');
  if (redgreenEvidence) {
    // A protan/deutan split without missed red-green plates matches no
    // simulated observer, so it never names a subtype on its own.
    const rgMissed = miss.redgreen >= T.redgreenMiss;
    if (rgMissed && miss.protan >= T.subtypeMin && miss.protan - miss.deutan >= T.subtypeMargin) return result('protan');
    if (rgMissed && miss.deutan >= T.subtypeMin && miss.deutan - miss.protan >= T.subtypeMargin) return result('deutan');
    return result('redgreen');
  }
  if (tritanEvidence) return result('tritan');
  const totalMiss = KINDS.reduce((s, k) => s + miss[k], 0);
  return result(totalMiss <= T.normalMaxMiss ? 'normal' : 'inconclusive');
}
