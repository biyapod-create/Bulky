const fs = require('fs');
let src = fs.readFileSync('C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Dashboard.js', 'utf8');
const lines = src.split('\n');

// Fix line 173 (index 172) directly
lines[172] = `            <div style={{ width:'7px', height:'7px', borderRadius:'50%', background: stats.isSafeToSend ? 'var(--success)' : 'var(--warning)', boxShadow: stats.isSafeToSend ? '0 0 6px rgba(34,197,94,0.4)' : 'none' }} />`;

src = lines.join('\n');
fs.writeFileSync('C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Dashboard.js', src, 'utf8');
console.log('Fixed. Line 173:', lines[172]);
