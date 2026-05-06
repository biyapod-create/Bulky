const fs = require('fs');
let css = fs.readFileSync('renderer/src/index.css', 'utf8');

// Fix dangling selector with empty body — ".dashboard-reference-kpis,\n  \n}"
css = css.replace(/\s*\.dashboard-reference-kpis,\s*\n\s*\}/g, '\n}');

// Also catch any other dangling comma selectors before a closing brace
css = css.replace(/,\s*\n\s*\}/g, '\n}');

fs.writeFileSync('renderer/src/index.css', css);
console.log('Fixed dangling selectors');
