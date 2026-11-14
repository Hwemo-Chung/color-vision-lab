import { detectLang, setLang, LANGS } from './i18n.js';
import { initSimulator } from './simulator.js';
import { initTest } from './test.js';

setLang(detectLang());

document.querySelectorAll('.lang button').forEach((b) => {
  b.addEventListener('click', () => {
    if (LANGS.includes(b.dataset.lang)) setLang(b.dataset.lang, { user: true });
  });
});

const sim = initSimulator();
initTest({ onShowInSimulator: (presetId) => sim.selectPreset(presetId) });
