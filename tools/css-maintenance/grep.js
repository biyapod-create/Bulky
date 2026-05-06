const fs = require('fs');
const c = fs.readFileSync('renderer/src/index.css', 'utf8');
const lines = c.split('\n');
const hits = [];
const keys = ['dashboard-reference-grid','dashboard-reference-kpi','dashboard-right-rail',
  'modal-overlay','dashboard-panel-chart','dashboard-panel-table',
  'dashboard-panel-donut','dashboard-panel-heatmap','dashboard-reference-footer'];
lines.forEach((l,i) => {
  if (keys.some(k => l.includes(k))) hits.push((i+1)+': '+l.trim());
});
console.log(hits.join('\n'));
