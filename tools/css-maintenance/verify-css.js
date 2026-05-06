const fs = require('fs');
const css = fs.readFileSync('renderer/src/index.css', 'utf8');
const lines = css.split('\n');
console.log('Total lines:', lines.length);

// Spot-check key rules survived
const checks = [
  '.nav-item', '.card', '.btn-primary', '.stat-card',
  '.sidebar', '.modal ', '.toast', '.cmd-palette',
  '.settings-shell', '.donut-chart-wrap', '.dashboard-kpi-card-ref',
  'CANONICAL LAYOUT'
];
checks.forEach(k => {
  const found = css.includes(k);
  console.log((found ? '✅' : '❌') + ' ' + k);
});
