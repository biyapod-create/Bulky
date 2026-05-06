/**
 * consolidate-css.js
 * Strips all duplicate dashboard-reference-* grid / modal-overlay rules
 * then appends one canonical authoritative block at the end.
 */
const fs = require('fs');
const file = 'renderer/src/index.css';
let css = fs.readFileSync(file, 'utf8');

// ── 1. Remove every block that contains these class names so we can rewrite clean
const STRIP_PATTERNS = [
  // Match full CSS rule blocks containing these selectors
  /\.dashboard-reference-grid\s*\{[^}]*\}/g,
  /\.dashboard-reference-kpis\s*\{[^}]*\}/g,
  /\.dashboard-reference-footer\s*(?!-)[^{]*\{[^}]*\}/g,
  /\.dashboard-right-rail\s*\{[^}]*\}/g,
  /\.dashboard-panel-chart\s*\{[^}]*\}/g,
  /\.dashboard-panel-donut\s*\{[^}]*\}/g,
  /\.dashboard-panel-heatmap\s*\{[^}]*\}/g,
  /\.dashboard-panel-table\s*\{[^}]*\}/g,
];

for (const pat of STRIP_PATTERNS) {
  // Only strip simple single-class rules, not comma-separated or nested
  css = css.replace(pat, '/* [consolidated] */');
}

// ── 2. Strip old modal-overlay background/backdrop rules from our appended blocks
// (keep the original one at ~line 1032, remove later duplicates)
// We'll do this by removing the appended modal-overlay blocks we control
css = css.replace(/\/\* modal-overlay backdrop removed \*\//g, '');

// ── 3. Append the single canonical grid + modal definition
const canonical = `

/* ═══════════════════════════════════════════════════════════════════════════
   CANONICAL LAYOUT — dashboard grid · modal · single source of truth
   All previous definitions of these rules have been consolidated here.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Modal: no background overlay, subtle border only ── */
.modal-overlay {
  position: fixed !important;
  inset: 0 !important;
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: var(--z-modal) !important;
  padding: 20px !important;
}

.modal {
  background: var(--bg-secondary) !important;
  border: 1px solid var(--border-strong) !important;
  border-radius: var(--radius-xl) !important;
  width: 100% !important;
  max-height: 90vh !important;
  overflow-y: auto !important;
  box-shadow: var(--shadow-lg) !important;
}

/* ── KPI row: fit as many as possible, min 160px each ── */
.dashboard-reference-kpis {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)) !important;
  gap: 10px !important;
  margin-bottom: 10px !important;
  min-width: 0 !important;
}

/* ── Main grid: chart | donut | rail — fixed proportions, no overflow ── */
.dashboard-reference-grid {
  display: grid !important;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr) minmax(0, 0.72fr) !important;
  grid-template-rows: auto auto !important;
  grid-template-areas:
    "chart  donut  rail"
    "heatmap table  rail" !important;
  gap: 10px !important;
  min-width: 0 !important;
  overflow: hidden !important;
}

.dashboard-panel-chart   { grid-area: chart   !important; min-width: 0 !important; overflow: hidden !important; }
.dashboard-panel-donut   { grid-area: donut   !important; min-width: 0 !important; overflow: hidden !important; }
.dashboard-panel-heatmap { grid-area: heatmap !important; min-width: 0 !important; overflow: hidden !important; }
.dashboard-panel-table   { grid-area: table   !important; min-width: 0 !important; overflow: hidden !important; }

.dashboard-right-rail {
  grid-area: rail !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
  min-width: 0 !important;
  overflow: hidden !important;
}

/* ── Footer: auto-fit, min 180px ── */
.dashboard-reference-footer {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important;
  gap: 10px !important;
  min-width: 0 !important;
  overflow: hidden !important;
  margin-top: 10px !important;
}

/* ── Responsive: stack at 1300px, single col at 900px ── */
@media (max-width: 1300px) {
  .dashboard-reference-grid {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.9fr) !important;
    grid-template-areas:
      "chart  donut"
      "heatmap table"
      "rail    rail" !important;
  }
  .dashboard-right-rail {
    flex-direction: row !important;
    flex-wrap: wrap !important;
  }
  .dashboard-right-rail > .card {
    flex: 1 1 200px !important;
    min-width: 180px !important;
  }
}

@media (max-width: 900px) {
  .dashboard-reference-kpis {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)) !important;
  }
  .dashboard-reference-grid {
    grid-template-columns: 1fr !important;
    grid-template-areas:
      "chart"
      "donut"
      "heatmap"
      "table"
      "rail" !important;
  }
  .dashboard-right-rail {
    flex-direction: row !important;
    flex-wrap: wrap !important;
  }
}

@media (max-width: 600px) {
  .dashboard-reference-kpis {
    grid-template-columns: 1fr 1fr !important;
  }
  .dashboard-reference-footer {
    grid-template-columns: 1fr 1fr !important;
  }
}
`;

css += canonical;
fs.writeFileSync(file, css);
console.log('CSS consolidated OK — ' + file);
