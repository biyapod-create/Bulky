/**
 * css-sweep.js
 * Surgical redundancy sweep:
 *  1. Back up original
 *  2. Deduplicate @keyframes (keep last)
 *  3. Remove empty/placeholder rule blocks
 *  4. Merge duplicate simple selectors into last occurrence
 *  5. Strip !important from properties that don't need it
 *     (inside the appended canonical block, keep them; everywhere else strip)
 *  6. Collapse excess blank lines
 *  7. Write cleaned file + report savings
 */
const fs = require('fs');
const path = require('path');

const FILE = 'renderer/src/index.css';
const BACKUP = 'tools/css-maintenance/archive/index.css.bak';

let css = fs.readFileSync(FILE, 'utf8');
fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
fs.writeFileSync(BACKUP, css); // always back up first
console.log('Backup written to', BACKUP);

const before = css.split('\n').length;

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Remove empty/placeholder blocks
// Matches:  .some-selector { } or { /* [consolidated] */ } or { \n }
// ─────────────────────────────────────────────────────────────────────────────
css = css.replace(/[^{}@\n][^{}]*\{\s*(\/\*[^*]*\*\/)?\s*\}/g, (m) => {
  const body = m.replace(/^[^{]*\{/, '').replace(/\}$/, '').trim()
    .replace(/\/\*.*?\*\//g, '').trim();
  return body === '' ? '' : m;
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Deduplicate @keyframes (keep last occurrence of each name)
// ─────────────────────────────────────────────────────────────────────────────
const seenKeyframes = {};
// Find all @keyframes blocks
const kfRegex = /@keyframes\s+([\w-]+)\s*\{(?:[^{}]*|\{[^{}]*\})*\}/g;
const allKf = [...css.matchAll(kfRegex)].map(m => ({ name: m[1], full: m[0], index: m.index }));

// For each name, remove all but the last
const kfByName = {};
allKf.forEach(kf => { kfByName[kf.name] = kf; }); // last wins

// Remove duplicates (all but last)
const toRemove = new Set();
const seen = {};
allKf.forEach(kf => {
  if (seen[kf.name]) toRemove.add(seen[kf.name].full);
  seen[kf.name] = kf;
});
toRemove.forEach(kfStr => { css = css.replace(kfStr, ''); });
console.log('Deduplicated keyframes:', toRemove.size);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Deduplicate simple selectors
// Strategy: for selectors that appear multiple times, keep the LAST definition.
// We do NOT merge media queries (too risky) — only plain class/element selectors.
// ─────────────────────────────────────────────────────────────────────────────

// Selectors safe to deduplicate (exact matches only, single-class, no commas, no @)
const SAFE_DEDUP = [
  // Layout
  '.app-container', '.main-layout', '.main-content', '.main-content-inner',
  // TitleBar
  '.title-bar', '.title-bar-brand', '.title-bar-logo', '.title-bar-controls',
  '.title-bar-btn', '.title-bar-search',
  // Sidebar
  '.sidebar', '.sidebar-brand', '.sidebar-logo', '.sidebar-logo-img',
  '.sidebar-logo-text', '.sidebar-logo-fallback', '.sidebar-logo-wrap',
  '.sidebar-nav', '.sidebar-section-label', '.sidebar-group',
  '.sidebar-settings-group', '.sidebar-version-pill', '.sidebar-workspace-chip',
  '.sidebar-workspace-badge', '.sidebar-footer',
  // Nav
  '.nav-item', '.nav-item:hover', '.nav-item.active', '.nav-item.active::after',
  '.nav-item.active::before', '.nav-item svg',
  // Card / Surface
  '.card', '.card-header', '.card-title',
  // KPI
  '.dashboard-kpi-card-ref', '.dashboard-kpi-card-head', '.dashboard-kpi-card-icon',
  '.dashboard-kpi-card-title', '.dashboard-kpi-card-value', '.dashboard-kpi-card-header-copy',
  '.dashboard-kpi-trend-row', '.dashboard-kpi-trend', '.dashboard-kpi-delta-label',
  // Notification
  '.notification-center-badge',
  // Toast
  '.toast',
  // Sidebar AI
  '.sidebar-ai-badge', '.sidebar-ai-clarify', '.sidebar-ai-clarify-btn',
  // Misc dashboard
  '.dashboard-top-table-row',
];

let dedupCount = 0;

SAFE_DEDUP.forEach(selector => {
  // Escape for regex
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the rule block — selector followed by { ... }
  // We capture with a simple brace-depth approach via repeated replace
  const pattern = new RegExp(
    `(?<![\\w-])${escaped}\\s*\\{[^{}]*\\}`,
    'g'
  );
  const matches = [...css.matchAll(pattern)];
  if (matches.length <= 1) return; // nothing to deduplicate

  // Remove all but the last match
  const lastMatch = matches[matches.length - 1];
  let removed = 0;
  // We go from end to start to preserve indices
  for (let i = matches.length - 2; i >= 0; i--) {
    const m = matches[i];
    css = css.slice(0, m.index) + '' + css.slice(m.index + m[0].length);
    removed++;
    dedupCount++;
  }
});

console.log('Deduplicated rule blocks:', dedupCount);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Strip !important from properties that don't need it
// Keep !important ONLY inside the canonical layout block (last 200 lines)
// and in @media rules, and in known necessary overrides
// ─────────────────────────────────────────────────────────────────────────────

// Split at the canonical marker
const CANONICAL_MARKER = 'CANONICAL LAYOUT';
const canonicalIdx = css.lastIndexOf(CANONICAL_MARKER);

const before_canonical = canonicalIdx > 0 ? css.slice(0, canonicalIdx) : css;
const after_canonical  = canonicalIdx > 0 ? css.slice(canonicalIdx)    : '';

// In the non-canonical section, remove !important EXCEPT from:
// - .tab.active (needed to override specificity)
// - .tab.active:hover
// - body.theme-* overrides
// - @media blocks (they're fine)
// - animation/transition none (reduced-motion)
const KEEP_IMPORTANT_PATTERNS = [
  /\.tab\.active/,
  /body\.theme/,
  /animation:\s*none/,
  /transition:\s*none/,
  /@media.*prefers-reduced-motion/,
  /color-scheme/,
];

let importantStripped = 0;
const cleanedBefore = before_canonical.split('\n').map(line => {
  if (!line.includes('!important')) return line;
  if (KEEP_IMPORTANT_PATTERNS.some(p => p.test(line))) return line;
  // Strip it
  importantStripped++;
  return line.replace(/\s*!important/g, '');
}).join('\n');

css = cleanedBefore + after_canonical;
console.log('!important stripped:', importantStripped);

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Remove leftover duplicate :root and [data-theme] blocks
// We already fixed these but there may still be old ones
// ─────────────────────────────────────────────────────────────────────────────

// Remove the old secondary :root block (the one around line 4344)
// It was a duplicate of the primary :root at line 2
// Keep the FIRST :root (the comprehensive one we wrote)
// Strategy: find all :root { } blocks, keep first, blank rest
const rootRegex = /:root\s*\{[^}]*\}/g;
const rootMatches = [...css.matchAll(rootRegex)];
if (rootMatches.length > 1) {
  // Remove all but the first
  for (let i = rootMatches.length - 1; i >= 1; i--) {
    const m = rootMatches[i];
    css = css.slice(0, m.index) + '/* :root consolidated */' + css.slice(m.index + m[0].length);
  }
  console.log('Removed duplicate :root blocks:', rootMatches.length - 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — Collapse excess blank lines (3+ → 2)
// ─────────────────────────────────────────────────────────────────────────────
css = css.replace(/\n{4,}/g, '\n\n\n');

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Remove comment-only placeholder lines
// ─────────────────────────────────────────────────────────────────────────────
css = css.replace(/^\s*\/\*\s*:root consolidated\s*\*\/\s*$/gm, '');
css = css.replace(/^\s*\/\*\s*\[consolidated\]\s*\*\/\s*$/gm, '');

// Final cleanup
css = css.replace(/\n{4,}/g, '\n\n\n').trim() + '\n';

fs.writeFileSync(FILE, css);

const after = css.split('\n').length;
const saved = before - after;
console.log('\n══════════════════════════════════════');
console.log('SWEEP COMPLETE');
console.log('══════════════════════════════════════');
console.log('Lines before:', before);
console.log('Lines after: ', after);
console.log('Lines saved: ', saved, `(${((saved/before)*100).toFixed(1)}% reduction)`);
console.log('Backup at:   ', BACKUP);
