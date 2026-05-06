const fs = require('fs');
let css = fs.readFileSync('renderer/src/index.css', 'utf8');

// Remove bare @ symbols left by stripped @media blocks
css = css.replace(/^@\s*$/gm, '');

// Remove any @media block that has been stripped to just "@media ... { }" with no content
css = css.replace(/@media[^{]+\{\s*\}/g, '');

// Collapse blanks
css = css.replace(/\n{4,}/g, '\n\n\n').trim() + '\n';

fs.writeFileSync('renderer/src/index.css', css);
console.log('Fixed bare @ remnants. Lines:', css.split('\n').length);
