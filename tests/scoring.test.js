import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAnswers } from '../src/core/scoring.js';
import { PLATES } from '../src/core/plates.js';

/** A wrong answer that is still a plausible 1-2 digit string. */
const wrong = (answer) => (answer === '7' ? '1' : '7');

/** Build an answer sheet: `miss(def)` returns a response or undefined (= correct). */
function sheet(miss = () => undefined) {
  return PLATES.map((def) => {
    const r = miss(def);
    return { plateId: def.id, response: r === undefined ? def.answer : r };
  });
}
const missKinds = (kinds, response = 'wrong') => (def) =>
  kinds.includes(def.kind) ? (response === 'wrong' ? wrong(def.answer) : response) : undefined;

test('all correct -> normal', () => {
  const r = scoreAnswers(sheet());
  assert.equal(r.verdict, 'normal');
  assert.equal(r.controlFailed, false);
  assert.equal(r.correct, 13);
  assert.equal(r.total, 13);
  assert.deepEqual(r.byKind, {
    redgreen: { correct: 4, total: 4 },
    protan: { correct: 3, total: 3 },
    deutan: { correct: 3, total: 3 },
    tritan: { correct: 2, total: 2 },
  });
});

test('control wrong -> inconclusive with controlFailed, whatever else happens', () => {
  for (const resp of [null, 'x', wrong(PLATES[0].answer)]) {
    const r = scoreAnswers(sheet((d) => (d.kind === 'control' ? resp : undefined)));
    assert.equal(r.verdict, 'inconclusive');
    assert.equal(r.controlFailed, true);
    assert.equal(r.correct, 12);
  }
});

test('protan pattern: red-green and protan plates missed, deutan plates read -> protan', () => {
  const r = scoreAnswers(sheet(missKinds(['redgreen', 'protan'])));
  assert.equal(r.verdict, 'protan');
  assert.equal(r.controlFailed, false);
  assert.deepEqual(r.byKind.protan, { correct: 0, total: 3 });
});

test('deutan pattern: red-green and deutan plates missed, protan plates read -> deutan', () => {
  const r = scoreAnswers(sheet(missKinds(['redgreen', 'deutan'])));
  assert.equal(r.verdict, 'deutan');
});

test('red-green misses without a clear protan/deutan split -> redgreen', () => {
  assert.equal(scoreAnswers(sheet(missKinds(['redgreen', 'protan', 'deutan']))).verdict, 'redgreen');
  assert.equal(scoreAnswers(sheet(missKinds(['redgreen']))).verdict, 'redgreen');
  // One protan-plate miss more than deutan is not enough to name a subtype.
  let p = 0;
  let d = 0;
  const r = scoreAnswers(sheet((def) => {
    if (def.kind === 'redgreen') return wrong(def.answer);
    if (def.kind === 'protan' && p++ < 2) return wrong(def.answer);
    if (def.kind === 'deutan' && d++ < 1) return wrong(def.answer);
    return undefined;
  }));
  assert.equal(r.verdict, 'redgreen');
});

test('subtype plates missed while red-green plates are read -> redgreen, never a subtype', () => {
  assert.equal(scoreAnswers(sheet(missKinds(['protan']))).verdict, 'redgreen');
  assert.equal(scoreAnswers(sheet(missKinds(['deutan']))).verdict, 'redgreen');
});

test('tritan pattern -> tritan', () => {
  const r = scoreAnswers(sheet(missKinds(['tritan'])));
  assert.equal(r.verdict, 'tritan');
  assert.deepEqual(r.byKind.tritan, { correct: 0, total: 2 });
});

test('null responses count as wrong', () => {
  const withNull = scoreAnswers(sheet(missKinds(['redgreen', 'protan'], null)));
  const withWrong = scoreAnswers(sheet(missKinds(['redgreen', 'protan'])));
  assert.deepEqual(withNull, withWrong);
  assert.equal(withNull.correct, 13 - 7);
  assert.equal(scoreAnswers(sheet(missKinds(['tritan'], null))).verdict, 'tritan');
});

test('a single slip is still normal; scattered misses are inconclusive', () => {
  let once = false;
  const one = scoreAnswers(sheet((d) => (d.kind === 'redgreen' && !once ? ((once = true), null) : undefined)));
  assert.equal(one.verdict, 'normal');
  let rg = false;
  let tr = false;
  const scattered = scoreAnswers(sheet((d) => {
    if (d.kind === 'redgreen' && !rg) { rg = true; return null; }
    if (d.kind === 'tritan' && !tr) { tr = true; return null; }
    return undefined;
  }));
  assert.equal(scattered.verdict, 'inconclusive');
});

test('missing both red-green and tritan figures (e.g. everything) -> inconclusive', () => {
  const r = scoreAnswers(sheet(missKinds(['redgreen', 'protan', 'deutan', 'tritan'], null)));
  assert.equal(r.verdict, 'inconclusive');
  assert.equal(r.controlFailed, false);
});

test('responses are normalised (whitespace, full-width digits)', () => {
  const r = scoreAnswers(PLATES.map((d) => ({
    plateId: d.id,
    response: ` ${d.answer.replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0))} `,
  })));
  assert.equal(r.correct, 13);
  assert.equal(r.verdict, 'normal');
});

test('incomplete answer sheets are inconclusive; unknown plate ids are ignored', () => {
  const partial = scoreAnswers(sheet().slice(0, 8));
  assert.equal(partial.verdict, 'inconclusive');
  assert.equal(partial.total, 8);
  const extra = scoreAnswers([...sheet(), { plateId: 'nope', response: '1' }]);
  assert.equal(extra.verdict, 'normal');
  assert.equal(extra.total, 13);
});
