import { STRINGS, DEFAULT_LANG } from '../i18n/strings.js';

export const LANGS = ['ko', 'en', 'ja'];
const STORE_KEY = 'cvl-lang';
let current = DEFAULT_LANG;
const listeners = new Set();

export function detectLang() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(q)) return q;
  } catch { /* ignore */ }
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* storage may be blocked */ }
  const nav = String(navigator.language || '').slice(0, 2).toLowerCase();
  return LANGS.includes(nav) ? nav : DEFAULT_LANG;
}

export function getLang() { return current; }

export function t(key, vars) {
  let s = STRINGS[current]?.[key] ?? STRINGS[DEFAULT_LANG][key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

export function onLangChange(fn) { listeners.add(fn); }

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    });
  });
  root.querySelectorAll('[data-i18n-content]').forEach((el) => { el.setAttribute('content', t(el.dataset.i18nContent)); });
}

// opts.user = true when the visitor chose the language (persist + write URL).
export function setLang(lang, { user = false } = {}) {
  if (!LANGS.includes(lang)) lang = DEFAULT_LANG;
  current = lang;
  document.documentElement.lang = lang;
  document.title = t('meta.title');
  applyI18n(document);
  document.querySelectorAll('.lang button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  });
  if (user) {
    try { localStorage.setItem(STORE_KEY, lang); } catch { /* ignore */ }
    try {
      const u = new URL(location.href);
      u.searchParams.set('lang', lang);
      history.replaceState(history.state, '', u);
    } catch { /* ignore */ }
  }
  listeners.forEach((fn) => fn(lang));
}
