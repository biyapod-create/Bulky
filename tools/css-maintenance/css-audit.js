/**
 * css-audit.js — full redundancy analysis
 * Reports: duplicate selectors, conflicting property overrides,
 * dead vendor prefixes, empty rules, superseded !important chains
 */
const fs = require('fs');
const css = fs.readFileSync('renderer/src/index.css', 'utf8');
const lines = css.split('\n');

// ── 1. Extract all rule blocks with their line numbers ──────────────────────
const rules = [];
let depth = 0, blockStart = -1, selectorBuf = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const opens  = (line.match(/\{/g) || []).length;
  const closes = (line.match(/\}/g) || []).length;

  if (depth === 0 && opens > 0) {
    blockStart = i;
    selectorBuf = lines.slice(Math.max(0, i - 3), i + 1).join(' ').replace(/\s+/g, ' ').trim();
  }
  depth += opens - closes;
  if (depth === 0 && blockStart >= 0) {
    // Extract selector (everything before first {)
    const raw = lines.slice(blockStart, i + 1).join('\n');
    const selectorMatch = raw.match(/^([^{]+)\{/);
    const selector = selectorMatch ? selectorMatch[1].trim() : '';
    rules.push({ selector, startLine: blockStart + 1, endLine: i + 1, raw });
    blockStart = -1;
    selectorBuf = '';
  }
}

// ── 2. Find duplicate selectors ─────────────────────────────────────────────
const selectorMap = {};
rules.forEach(r => {
  const key = r.selector.replace(/\s+/g, ' ').trim();
  if (!selectorMap[key]) selectorMap[key] = [];
  selectorMap[key].push(r.startLine);
});

const duplicates = Object.entries(selectorMap)
  .filter(([, lines]) => lines.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

// ── 3. Find empty rules ─────────────────────────────────────────────────────
const emptyRules = rules.filter(r => {
  const body = r.raw.replace(/\/\*.*?\*\//gs, '').replace(/[^{}]*\{/, '').replace(/\}[^{}]*$/, '').trim();
  return body.length === 0 || body === '/* [consolidated] */';
});

// ── 4. Find !important overuse ──────────────────────────────────────────────
const importantLines = [];
lines.forEach((l, i) => {
  if (l.includes('!important')) importantLines.push({ line: i + 1, content: l.trim() });
});

// ── 5. Duplicate @keyframes ─────────────────────────────────────────────────
const keyframeMap = {};
const kfMatches = css.matchAll(/@keyframes\s+([\w-]+)/g);
for (const m of kfMatches) {
  if (!keyframeMap[m[1]]) keyframeMap[m[1]] = 0;
  keyframeMap[m[1]]++;
}
const dupKeyframes = Object.entries(keyframeMap).filter(([, c]) => c > 1);

// ── 6. Vendor prefixes that are now unnecessary ─────────────────────────────
const vendorPatterns = [
  '-webkit-border-radius', '-moz-border-radius',
  '-webkit-box-sizing', '-moz-box-sizing',
  '-webkit-transition:(?!.*(backdrop|filter))', // transition is fine without prefix now
  '-ms-flexbox', '-webkit-flex:', '-ms-flex:',
  '-webkit-linear-gradient',
];
const vendorHits = [];
lines.forEach((l, i) => {
  vendorPatterns.forEach(p => {
    if (new RegExp(p).test(l)) vendorHits.push({ line: i + 1, content: l.trim() });
  });
});

// ── 7. Superseded properties (same property defined multiple times in same block) ──
const propertyConflicts = [];
rules.forEach(r => {
  const body = r.raw.replace(/\/\*.*?\*\//gs, '');
  const props = {};
  const propMatches = body.matchAll(/([\w-]+)\s*:/g);
  for (const m of propMatches) {
    const prop = m[1];
    if (!props[prop]) props[prop] = 0;
    props[prop]++;
  }
  const multi = Object.entries(props).filter(([,c]) => c > 1 && !['transition','animation','background'].includes(p => p));
  if (multi.length > 0) propertyConflicts.push({ selector: r.selector, line: r.startLine, conflicts: multi });
});

// ── 8. Output report ────────────────────────────────────────────────────────
const report = [];
report.push('═══════════════════════════════════════════════════════════');
report.push('BULKY CSS REDUNDANCY AUDIT');
report.push('File: renderer/src/index.css  Total lines: ' + lines.length);
report.push('═══════════════════════════════════════════════════════════\n');

report.push(`DUPLICATE SELECTORS (${duplicates.length} found)`);
report.push('─────────────────────────────────────────────────────────');
duplicates.slice(0, 40).forEach(([sel, lineNums]) => {
  report.push(`  [×${lineNums.length}] "${sel.substring(0,80)}"  →  lines: ${lineNums.join(', ')}`);
});

report.push(`\nEMPTY/CONSOLIDATED RULES (${emptyRules.length} found)`);
report.push('─────────────────────────────────────────────────────────');
emptyRules.slice(0, 20).forEach(r => {
  report.push(`  Line ${r.startLine}: "${r.selector.substring(0,80)}"`);
});

report.push(`\nDUPLICATE @KEYFRAMES (${dupKeyframes.length} found)`);
report.push('─────────────────────────────────────────────────────────');
dupKeyframes.forEach(([name, count]) => {
  report.push(`  @keyframes ${name}  ×${count}`);
});

report.push(`\nUNNECESSARY VENDOR PREFIXES (${vendorHits.length} found)`);
report.push('─────────────────────────────────────────────────────────');
vendorHits.slice(0, 20).forEach(h => {
  report.push(`  Line ${h.line}: ${h.content.substring(0,90)}`);
});

report.push(`\n!IMPORTANT COUNT: ${importantLines.length} occurrences`);
report.push('─────────────────────────────────────────────────────────');
report.push('  (Only the canonical layout block should use !important)');
const importantBySelector = {};
importantLines.forEach(l => { importantBySelector[l.line] = l.content; });
// Show first 15
importantLines.slice(0, 15).forEach(l => {
  report.push(`  Line ${l.line}: ${l.content.substring(0,90)}`);
});

report.push('\n═══════════════════════════════════════════════════════════');
report.push('SUMMARY');
report.push('═══════════════════════════════════════════════════════════');
report.push(`  Duplicate selectors:        ${duplicates.length}`);
report.push(`  Empty/placeholder rules:    ${emptyRules.length}`);
report.push(`  Duplicate @keyframes:       ${dupKeyframes.length}`);
report.push(`  Unnecessary vendor prefix:  ${vendorHits.length}`);
report.push(`  !important occurrences:     ${importantLines.length}`);
const totalLines = lines.length;
report.push(`  Total CSS lines:            ${totalLines}`);
report.push(`  Estimated bloat lines:      ~${emptyRules.length * 3 + duplicates.reduce((s,[,l])=>s+(l.length-1)*8,0)}`);

const out = report.join('\n');
fs.writeFileSync('css-audit-report.txt', out);
console.log(out);
