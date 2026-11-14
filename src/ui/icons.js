// Inline SVG snippets (decorative; callers add aria-hidden context).
const wrap = (inner) =>
  `<svg class="ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">${inner}</svg>`;

export const ICON_CHECK = wrap('<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>');
export const ICON_INFO = wrap('<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>');
export const ICON_WARN = wrap('<path d="M12 3l10 18H2L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 17.8v.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>');
export const ICON_HELP = wrap('<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.2 9.5a2.8 2.8 0 015.5.6c0 1.9-2.7 2.2-2.7 4M12 17.4v.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>');
