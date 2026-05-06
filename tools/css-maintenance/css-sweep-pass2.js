/**
 * css-sweep-pass2.js — Second pass targeting remaining single-class duplicates
 */
const fs = require('fs');
const FILE = 'renderer/src/index.css';
let css = fs.readFileSync(FILE, 'utf8');
const before = css.split('\n').length;

const PASS2_DEDUP = [
  // Remaining duplicates from audit
  '.modal-overlay', '.modal',
  '.toast-container', '.toast-container *',
  '.notification-center', '.notification-center-panel', '.notification-center-list',
  '.notification-center-badge',
  '.sidebar-settings-group::before',
  '.page-subtitle',
  '.stats-grid-4', '.stats-grid-5',
  '.dashboard-main-grid', '.dashboard-bottom-grid',
  '.stat-card', '.stat-value',
  '.form-textarea', '.form-textarea:focus',
  '.table td', '.table tbody tr:hover td',
  '.badge-success',
  '.progress-fill',
  '.title-bar-tray-btn', '.title-bar-pill',
  '.nav-item.active svg',
  '.dashboard-reference-footer-dot',
  '.dashboard-reference-toolbar.exact',
  '.dashboard-link-button',
  '.dashboard-kpi-card.is-clickable:hover',
  '.dashboard-kpi-icon', '.dashboard-kpi-value',
  '.dashboard-kpi-card-ref',
  '.sidebar-settings-group::before',
  '.sidebar-ai-badge', '.sidebar-ai-clarify', '.sidebar-ai-clarify-btn',
  '.sidebar-version-pill',
  // Empty @media stubs
];

let dedupCount = 0;

PASS2_DEDUP.forEach(selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\w-#.])${escaped}\\s*\\{[^{}]*\\}`, 'g');
  const matches = [...css.matchAll(pattern)];
  if (matches.length <= 1) return;
  // Remove all but last
  for (let i = matches.length - 2; i >= 0; i--) {
    const m = matches[i];
    css = css.slice(0, m.index) + css.slice(m.index + m[0].length);
    dedupCount++;
  }
});

// Remove empty @media blocks
css = css.replace(/@media[^{]+\{\s*\}/g, '');

// Remove duplicate [data-theme="light"] — keep the comprehensive one (first)
const dtlRegex = /\[data-theme="light"\]\s*\{[^}]*\}/g;
const dtlMatches = [...css.matchAll(dtlRegex)];
if (dtlMatches.length > 1) {
  for (let i = dtlMatches.length - 1; i >= 1; i--) {
    const m = dtlMatches[i];
    css = css.slice(0, m.index) + css.slice(m.index + m[0].length);
    dedupCount++;
  }
}

// Remove duplicate `body` blocks — keep first
const bodyRegex = /^body\s*\{[^}]*\}/gm;
const bodyMatches = [...css.matchAll(bodyRegex)];
if (bodyMatches.length > 1) {
  for (let i = bodyMatches.length - 1; i >= 1; i--) {
    const m = bodyMatches[i];
    css = css.slice(0, m.index) + css.slice(m.index + m[0].length);
    dedupCount++;
  }
}

// Collapse blanks
css = css.replace(/\n{4,}/g, '\n\n\n').trim() + '\n';
fs.writeFileSync(FILE, css);

const after = css.split('\n').length;
console.log('Pass 2 complete. Removed:', dedupCount, 'blocks');
console.log('Lines before:', before, '→ after:', after, '(saved', before - after, ')');
