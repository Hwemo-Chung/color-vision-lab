import { PRESETS, simulateImageData } from '../core/cvd.js';
import { t, onLangChange } from './i18n.js';
import { SAMPLE_IDS, SAMPLE_W, SAMPLE_H, drawSample } from './samples.js';
import { ICON_WARN, ICON_INFO } from './icons.js';

const MAX_EDGE = 1600;
const $ = (id) => document.getElementById(id);

export function initSimulator() {
  const chipsEl = $('chips');
  const slider = $('severity');
  const sliderOut = $('severity-out');
  const sampleSel = $('sample');
  const fileInput = $('file');
  const uploadBtn = $('upload-btn');
  const statusEl = $('sim-status');
  const well = $('sim-well');
  const stage = $('stage');
  const canvas = $('sim-canvas');
  const currentEl = $('current');
  const downloadBtn = $('download');
  const ctx = canvas.getContext('2d');

  const state = {
    type: 'deutan',
    severity: 0.8,
    split: 0.5,
    sourceKind: 'sample', // 'sample' | 'user'
    sampleId: SAMPLE_IDS[0],
    w: 0,
    h: 0,
    orig: null, // cached original pixels (Uint8ClampedArray), never re-read
    origCanvas: null,
    simCanvas: null,
    simDirty: true,
    raf: 0,
    loadToken: 0,
    status: null, // { kind, key }
  };

  /* ---------- presets ---------- */
  function activePresetId() {
    if (!state.type || state.severity <= 0) return 'normal';
    const full = state.severity >= 1;
    const p = PRESETS.find((x) => x.type === state.type && (x.severity === 1) === full);
    return p ? p.id : 'normal';
  }

  const chipEls = new Map();
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip glass-chip';
    b.dataset.id = p.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML =
      '<svg class="chip-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="chip-text"></span>';
    b.addEventListener('click', () => selectPreset(p.id));
    chipsEl.appendChild(b);
    chipEls.set(p.id, b);
  }

  function presetName() { return t('preset.' + activePresetId()); }

  function syncControls() {
    const active = activePresetId();
    for (const [id, b] of chipEls) {
      b.querySelector('.chip-text').textContent = t('preset.' + id);
      const on = id === active;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-active', on);
    }
    const pct = Math.round(state.severity * 100);
    slider.value = String(pct);
    sliderOut.textContent = pct + '%';
    const disabled = !state.type;
    slider.disabled = disabled;
    if (disabled) slider.title = t('sim.severity.disabledHint');
    else slider.removeAttribute('title');
    currentEl.textContent = active === 'normal' && (!state.type || state.severity <= 0)
      ? t('sim.current.normal')
      : t('sim.current', { name: presetName(), pct });
    stage.setAttribute('aria-label', t('sim.stage.label', {
      name: state.sourceKind === 'user' ? t('sim.image.user') : t('sample.' + state.sampleId),
    }));
    stage.setAttribute('aria-description', t('sim.slider.label') + '. ' + t('sim.stage.hint'));
  }

  function selectPreset(id) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    state.type = p.type;
    state.severity = p.severity;
    state.simDirty = true;
    syncControls();
    schedule();
  }

  slider.addEventListener('input', () => {
    if (!state.type) return;
    state.severity = Number(slider.value) / 100;
    state.simDirty = true;
    syncControls();
    schedule();
  });

  /* ---------- rendering ---------- */
  function schedule() {
    if (!state.raf) state.raf = requestAnimationFrame(render);
  }

  function computeSim() {
    if (!state.orig || !state.simDirty) return;
    const { w, h } = state;
    const passthrough = !state.type || state.severity <= 0;
    const out = passthrough ? state.orig : simulateImageData(state.orig, state.type, state.severity);
    state.simCanvas.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
    state.simDirty = false;
  }

  function render() {
    state.raf = 0;
    if (!state.orig) return;
    try {
      computeSim();
    } catch (e) {
      console.error(e);
      return;
    }
    const { w, h } = state;
    const x = Math.round(state.split * w);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(state.origCanvas, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, w - x, h);
    ctx.clip();
    ctx.drawImage(state.simCanvas, 0, 0);
    ctx.restore();
    drawDivider(x);
  }

  // Divider is drawn into the canvas pixels in achromatic tones (no DOM overlay).
  function drawDivider(x) {
    const { w, h } = state;
    const k = w / (canvas.clientWidth || w);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = 5 * k;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 * k;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    const cy = h / 2, r = 19 * k;
    ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f2f2f2'; ctx.fill();
    ctx.lineWidth = 3 * k; ctx.strokeStyle = '#1a1a1a'; ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    const a = 6 * k;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + dir * (r * 0.28), cy - a);
      ctx.lineTo(x + dir * (r * 0.28 + a), cy);
      ctx.lineTo(x + dir * (r * 0.28), cy + a);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function setPixels(imageData) {
    const { width: w, height: h } = imageData;
    state.w = w; state.h = h;
    canvas.width = w; canvas.height = h;
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    state.origCanvas = mk();
    state.simCanvas = mk();
    state.origCanvas.getContext('2d').putImageData(imageData, 0, 0);
    state.orig = imageData.data;
    state.simDirty = true;
    syncControls();
    schedule();
  }

  /* ---------- status ---------- */
  function showStatus(kind, key) {
    state.status = key ? { kind, key } : null;
    renderStatus();
  }
  function renderStatus() {
    if (!state.status) { statusEl.hidden = true; statusEl.textContent = ''; return; }
    const { kind, key } = state.status;
    statusEl.hidden = false;
    statusEl.className = 'status ' + (kind === 'error' ? 'is-error' : 'is-info');
    statusEl.innerHTML = (kind === 'error' ? ICON_WARN : ICON_INFO) + '<span></span>';
    statusEl.querySelector('span').textContent =
      (kind === 'error' ? t('common.error') + ': ' : '') + t(key);
  }

  /* ---------- sources ---------- */
  function loadSample(id) {
    state.loadToken++;
    state.sourceKind = 'sample';
    state.sampleId = id;
    sampleSel.value = id;
    const c = document.createElement('canvas');
    c.width = SAMPLE_W; c.height = SAMPLE_H;
    const cx = c.getContext('2d', { willReadFrequently: true });
    drawSample(cx, id, SAMPLE_W, SAMPLE_H);
    setPixels(cx.getImageData(0, 0, SAMPLE_W, SAMPLE_H));
    showStatus(null, null);
  }

  async function rasterize(file) {
    let bmp = null;
    let url = null;
    let src;
    try {
      try {
        bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        try { bmp = await createImageBitmap(file); } catch { bmp = null; }
      }
      if (bmp) {
        src = { img: bmp, w: bmp.width, h: bmp.height };
      } else {
        url = URL.createObjectURL(file);
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        await img.decode();
        src = { img, w: img.naturalWidth, h: img.naturalHeight };
      }
      if (!src.w || !src.h) throw new Error('empty image');
      const scale = Math.min(1, MAX_EDGE / Math.max(src.w, src.h));
      const w = Math.max(1, Math.round(src.w * scale));
      const h = Math.max(1, Math.round(src.h * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(src.img, 0, 0, w, h);
      return cx.getImageData(0, 0, w, h);
    } finally {
      if (bmp && bmp.close) bmp.close();
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function loadFile(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      showStatus('error', 'sim.error.type');
      return;
    }
    const token = ++state.loadToken;
    showStatus('info', 'sim.status.loading');
    try {
      const data = await rasterize(file);
      if (token !== state.loadToken) return; // superseded
      state.sourceKind = 'user';
      setPixels(data);
      showStatus(null, null);
    } catch (e) {
      if (token !== state.loadToken) return;
      console.error(e);
      showStatus('error', 'sim.error.decode');
    }
  }

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    loadFile(f);
  });
  sampleSel.addEventListener('change', () => loadSample(sampleSel.value));

  // drag & drop (on the neutral well; the canvas itself is never styled)
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  well.addEventListener('dragenter', (e) => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; well.classList.add('is-drop'); } });
  well.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  well.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) well.classList.remove('is-drop'); });
  well.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    well.classList.remove('is-drop');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    loadFile(f);
  });
  // a miss must not navigate the tab to the dropped file
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (hasFiles(e)) e.preventDefault(); });

  /* ---------- divider interaction ---------- */
  function setSplit(v) {
    state.split = Math.min(1, Math.max(0, v));
    const pct = Math.round(state.split * 100);
    stage.setAttribute('aria-valuenow', String(pct));
    stage.setAttribute('aria-valuetext', t('sim.slider.value', { pct }));
    schedule();
  }
  function splitFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return r.width ? (e.clientX - r.left) / r.width : 0.5;
  }
  let dragging = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setSplit(splitFromEvent(e));
    stage.focus({ preventScroll: true });
  });
  stage.addEventListener('pointermove', (e) => { if (dragging) setSplit(splitFromEvent(e)); });
  const endDrag = (e) => {
    dragging = false;
    try { stage.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    let v = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = state.split - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = state.split + step;
    else if (e.key === 'Home') v = 0;
    else if (e.key === 'End') v = 1;
    else if (e.key === 'PageDown') v = state.split - 0.1;
    else if (e.key === 'PageUp') v = state.split + 0.1;
    if (v === null) return;
    e.preventDefault();
    setSplit(v);
  });

  /* ---------- download ---------- */
  downloadBtn.addEventListener('click', () => {
    if (!state.orig) return;
    try { computeSim(); } catch (e) { console.error(e); return; }
    state.simCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `color-vision-${activePresetId()}-${Math.round(state.severity * 100)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  });

  /* ---------- i18n ---------- */
  function buildSampleOptions() {
    sampleSel.innerHTML = '';
    for (const id of SAMPLE_IDS) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = t('sample.' + id);
      sampleSel.appendChild(o);
    }
    sampleSel.value = state.sampleId;
  }
  onLangChange(() => {
    buildSampleOptions();
    syncControls();
    stage.setAttribute('aria-valuetext', t('sim.slider.value', { pct: Math.round(state.split * 100) }));
    renderStatus();
  });

  buildSampleOptions();
  loadSample(state.sampleId);
  setSplit(state.split);
  syncControls();

  // Redraw the divider handle when the displayed size changes (handle is sized in CSS px).
  if ('ResizeObserver' in window) new ResizeObserver(() => schedule()).observe(canvas);

  return { selectPreset };
}
