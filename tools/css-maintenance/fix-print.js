const fs = require('fs');
let css = fs.readFileSync('renderer/src/index.css', 'utf8');

// Fix print media block — remove dangling selector remnants inside it
css = css.replace(
  /@media print \{\s*\.sidebar,\s*\.title-bar,\s*\n\s*\n\s*\n\s*\}/,
  '@media print {\n  .sidebar, .title-bar { display: none; }\n}'
);

// Generic fix: remove any selector list ending in a comma before closing brace
// Pattern: "  .some-selector,\n  \n}" — dangling comma in selector list
css = css.replace(/,\s*\n(\s*\n)*\s*\}/g, '\n}');

// Remove completely empty @media blocks
css = css.replace(/@media[^{]+\{\s*\}/g, '');

// Collapse blanks
css = css.replace(/\n{4,}/g, '\n\n\n').trim() + '\n';

fs.writeFileSync('renderer/src/index.css', css);
console.log('Fixed print block and dangling selectors. Lines:', css.split('\n').length);
