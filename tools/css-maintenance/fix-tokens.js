const fs = require('fs');
let c = fs.readFileSync('renderer/src/index.css', 'utf8');

// 1. Neutralise the old violet-accent dark/light theme blocks that override accent
const oldBlock = /html\[data-theme="dark"\]\s*\{[^}]*--accent:\s*#7c3aed[^}]*\}[\s\S]*?html\[data-theme="light"\]\s*\{[^}]*--accent:\s*#7c3aed[^}]*\}/;
c = c.replace(oldBlock, 
  '/* html[data-theme] tokens consolidated at top of file */');

// 2. Update the section title
c = c.replace('EXCLUSIVE THEME SYSTEM + REFERENCE DASHBOARD OVERRIDES',
  'THEME SYSTEM — tokens consolidated at top of file');

// 3. Remove body radial hero gradients
c = c.replace(/body\.theme-dark\s*\{[^}]*background:[^}]*radial-gradient[^}]*\}/g,
  'body.theme-dark { background: var(--bg-primary); }');
c = c.replace(/body\.theme-light\s*\{[^}]*background:[^}]*radial-gradient[^}]*\}/g,
  'body.theme-light { background: var(--bg-primary); }');

fs.writeFileSync('renderer/src/index.css', c);
console.log('CSS tokens consolidated OK');
