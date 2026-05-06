const fs = require('fs');
let css = fs.readFileSync('renderer/src/index.css', 'utf8');
// Remove consolidated placeholders (they add noise, no CSS value)
css = css.replace(/\/\* \[consolidated\] \*\//g, '');
// Collapse 3+ consecutive blank lines to 2
css = css.replace(/\n{4,}/g, '\n\n\n');
fs.writeFileSync('renderer/src/index.css', css);
const lines = css.split('\n').length;
console.log('Cleaned. Lines:', lines);
