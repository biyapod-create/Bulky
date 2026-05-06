const fs = require('fs');
const src = fs.readFileSync('C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Dashboard.js', 'utf8');
const lines = src.split('\n');
// Find lines with bare CSS values that would break JSX — patterns like "border:Npx" without quotes
let found = 0;
lines.forEach((l, i) => {
  // Detect unquoted CSS values: number directly followed by a unit without quotes
  if (/:\s*\d+px [a-z]/.test(l) && !/'[^']*\d+px/.test(l) && !/`[^`]*\d+px/.test(l)) {
    console.log(`Possible unquoted CSS at line ${i+1}: ${l.trim().slice(0,120)}`);
    found++;
  }
});
if (!found) console.log('No unquoted CSS values found — Dashboard.js looks clean.');
console.log(`\nTotal lines: ${lines.length}`);
