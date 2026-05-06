const fs = require('fs');
let src = fs.readFileSync('C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Dashboard.js', 'utf8');
const lines = src.split('\n');

// Scan all lines for template literal syntax used inside regular quotes
lines.forEach((l, i) => {
  if (/'\$\{/.test(l) || /"[^"]*\$\{/.test(l)) {
    console.log(`Line ${i+1}: ${l.trim().slice(0,120)}`);
  }
});

// Fix line 280 specifically (index 279)
lines[279] = lines[279].replace(
  `width:\${pct}%, height`,
  "width:`${pct}%`, height"
);
// Also fix the surrounding quotes to make it a template literal
lines[279] = lines[279].replace(
  `width:\`\${pct}%\`, height:'100%', background: c.status==='completed' ? 'var(--success)' : 'var(--accent)', transition:'width 0.4s' }}`,
  "width:`${pct}%`, height:'100%', background: c.status==='completed' ? 'var(--success)' : 'var(--accent)', transition:'width 0.4s' }}"
);

src = lines.join('\n');
fs.writeFileSync('C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Dashboard.js', src, 'utf8');
console.log('\nFixed line 280:', lines[279].trim().slice(0,120));
