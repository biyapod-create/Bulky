const fs = require('fs');
let src = fs.readFileSync('C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Dashboard.js', 'utf8');

// Fix line 172: border:1px solid  → proper string
src = src.replace(
  `border:1px solid  }}>`,
  `border: stats.isSafeToSend ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(245,158,11,0.3)' }}>`
);

// Fix line 173: boxShadow:  0 6px  → proper string
src = src.replace(
  `boxShadow:  0 6px  }}`,
  `boxShadow: stats.isSafeToSend ? '0 0 6px rgba(34,197,94,0.3)' : 'none' }}`
);

fs.writeFileSync('C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Dashboard.js', src, 'utf8');

// Verify fix
const lines = src.split('\n');
[170,171,172,173].forEach(n => console.log(n+': '+lines[n-1]));
