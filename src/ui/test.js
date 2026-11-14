import { PLATES, generatePlate } from '../core/plates.js';
import { scoreAnswers } from '../core/scoring.js';
import { t, onLangChange } from './i18n.js';
import { ICON_CHECK, ICON_INFO, ICON_HELP, ICON_WARN } from './icons.js';

const $ = (id) => document.getElementById(id);
const KINDS = ['redgreen', 'protan', 'deutan', 'tritan'];
// verdict -> simulator preset offered as a follow-up link
const VERDICT_PRESET = { protan: 'protanopia', deutan: 'deuteranopia', redgreen: 'deuteranopia', tritan: 'tritanopia' };

export function initTest({ onShowInSimulator }) {
  const intro = $('test-intro');
  const run = $('test-run');
  const resultEl = $('test-result');
  const progress = $('progress');
  const box = $('plate-box');
  const canvas = $('plate-canvas');
  const form = $('answer-form');
  const input = $('answer');
  const cantSee = $('cantsee');
  const nextBtn = $('next');
  const hint = $('answer-hint');
  const startBtn = $('start');
  const introNote = $('intro-note');
  const ctx = canvas.getContext('2d');

  const total = PLATES.length;
  const plateCache = new Map();
  let phase = 'intro';
  let index = 0;
  let answers = [];
  let result = null;
  let raf = 0;

  function getPlate(i) {
    if (!plateCache.has(i)) plateCache.set(i, generatePlate(PLATES[i], 480));
    return plateCache.get(i);
  }

  function drawPlate() {
    raf = 0;
    if (phase !== 'run') return;
    const plate = getPlate(index);
    const css = Math.max(1, Math.round(box.clientWidth));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
    const k = px / plate.size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(plate.size / 2, plate.size / 2, plate.size / 2, 0, Math.PI * 2);
    ctx.clip();
    const [br, bg, bb] = plate.background;
    ctx.fillStyle = `rgb(${br},${bg},${bb})`;
    ctx.fillRect(0, 0, plate.size, plate.size);
    for (const d of plate.dots) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${d.color[0]},${d.color[1]},${d.color[2]})`;
      ctx.fill();
    }
    ctx.restore();
  }
  const scheduleDraw = () => { if (!raf) raf = requestAnimationFrame(drawPlate); };
  if ('ResizeObserver' in window) new ResizeObserver(scheduleDraw).observe(box);

  function showHint(key) {
    if (!key) { hint.hidden = true; hint.textContent = ''; hint.dataset.key = ''; return; }
    hint.hidden = false;
    hint.dataset.key = key;
    hint.className = 'status is-error';
    hint.innerHTML = ICON_WARN + '<span></span>';
    hint.querySelector('span').textContent = t(key);
  }

  function renderLabels() {
    introNote.textContent = t('test.intro.note', { total });
    if (phase === 'run') {
      progress.textContent = t('test.progress', { n: index + 1, total });
      canvas.setAttribute('aria-label', t('test.plate.label', { n: index + 1 }));
      nextBtn.textContent = index === total - 1 ? t('test.finish') : t('test.next');
      if (hint.dataset.key) showHint(hint.dataset.key);
    }
    if (phase === 'result') renderResult();
  }

  function setPhase(p) {
    phase = p;
    intro.hidden = p !== 'intro';
    run.hidden = p !== 'run';
    resultEl.hidden = p !== 'result';
    progress.hidden = p !== 'run';
    if (p !== 'result') resultEl.innerHTML = '';
  }

  function showPlate() {
    input.value = '';
    showHint(null);
    renderLabels();
    drawPlate();
    input.focus({ preventScroll: true });
  }

  function start() {
    answers = [];
    index = 0;
    result = null;
    setPhase('run');
    showPlate();
    $('test').scrollIntoView({ block: 'start' });
  }

  function record(response) {
    answers.push({ plateId: PLATES[index].id, response });
    if (index >= total - 1) { finish(); return; }
    index++;
    showPlate();
  }

  function finish() {
    result = scoreAnswers(answers);
    setPhase('result');
    renderResult();
    const h = resultEl.querySelector('h3');
    if (h) h.focus({ preventScroll: true });
    resultEl.scrollIntoView({ block: 'start' });
  }

  function renderResult() {
    if (!result) return;
    const v = result.verdict;
    const icon = v === 'normal' ? ICON_CHECK : v === 'inconclusive' ? ICON_HELP : ICON_INFO;
    const rows = KINDS.filter((k) => result.byKind && result.byKind[k] && result.byKind[k].total > 0).map((k) => {
      const { correct, total: tot } = result.byKind[k];
      const pct = tot ? Math.round((correct / tot) * 100) : 0;
      return `<li><span class="bk-name"></span><span class="bk-score">${correct} / ${tot}</span><span class="bar" aria-hidden="true"><i style="width:${pct}%"></i></span></li>`;
    });
    resultEl.innerHTML = `
      <h3 class="res-title" tabindex="-1"></h3>
      <div class="verdict" role="group">${icon}<div><span class="verdict-label"></span><strong class="verdict-text"></strong></div></div>
      <p class="score"></p>
      ${result.controlFailed ? `<p class="status is-error" data-ctl>${ICON_WARN}<span></span></p>` : ''}
      <h4 class="bk-title"></h4>
      <ul class="breakdown">${rows.join('')}</ul>
      <p class="note res-disc"></p>
      <div class="res-actions"></div>`;
    resultEl.querySelector('.res-title').textContent = t('test.result.title');
    resultEl.querySelector('.verdict-label').textContent = t('test.verdict.label') + ': ';
    resultEl.querySelector('.verdict-text').textContent = t('test.verdict.' + v);
    resultEl.querySelector('.score').textContent = t('test.score', { correct: result.correct, total: result.total });
    const ctl = resultEl.querySelector('[data-ctl] span');
    if (ctl) ctl.textContent = t('test.control.failed');
    resultEl.querySelector('.bk-title').textContent = t('test.breakdown');
    const names = resultEl.querySelectorAll('.bk-name');
    KINDS.filter((k) => result.byKind && result.byKind[k] && result.byKind[k].total > 0).forEach((k, i) => {
      names[i].textContent = t('test.kind.' + k);
    });
    resultEl.querySelector('.res-disc').textContent = t('test.result.disclaimer');
    const actions = resultEl.querySelector('.res-actions');
    const presetId = VERDICT_PRESET[v];
    if (presetId && !result.controlFailed) {
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = '#simulator';
      a.textContent = t('test.result.sim', { name: t('preset.' + presetId) });
      a.addEventListener('click', () => onShowInSimulator(presetId));
      actions.appendChild(a);
    }
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn primary';
    again.textContent = t('test.restart');
    again.addEventListener('click', start);
    actions.appendChild(again);
  }

  startBtn.addEventListener('click', start);

  input.addEventListener('input', () => {
    const cleaned = input.value.replace(/\D/g, '').slice(0, 2);
    if (cleaned !== input.value) input.value = cleaned;
    if (cleaned) showHint(null);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (phase !== 'run') return;
    const raw = input.value.replace(/\D/g, '');
    if (!raw) { showHint('test.hint.empty'); input.focus({ preventScroll: true }); return; }
    record(String(parseInt(raw, 10)));
  });
  cantSee.addEventListener('click', () => { if (phase === 'run') record(null); });

  onLangChange(renderLabels);
  setPhase('intro');
  renderLabels();
}
