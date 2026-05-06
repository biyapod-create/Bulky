const fs = require('fs');
let css = fs.readFileSync('renderer/src/index.css', 'utf8');

// Fix all cases where a selector list ends in a comma before a closing brace
// Pattern:  ".foo,\n  .bar,\n\n}" — trailing comma selector with empty body
// These arise when the deduper removed rule bodies but left the selector

// Pass 1: remove selector-only lines before empty rules or closing braces
// Repeatedly apply until stable
let prev;
let passes = 0;
do {
  prev = css;
  // Remove patterns like: ".something,\n  (blank lines)\n}"
  // or ".something,\n  .another,\n  (blank)\n}"
  css = css.replace(/([,\s]*[\w.#[\]"=*:>+~-][^{]*),\s*\n(\s*\n)*\s*\}/g, '\n}');
  passes++;
} while (css !== prev && passes < 20);

// Pass 2: remove @media blocks that now have empty bodies
css = css.replace(/@media[^{]+\{\s*\}/g, '');

// Pass 3: fix any rule that is JUST a selector list with no body at all
// Pattern: lines ending in comma with nothing after until }
css = css.replace(/\{(\s*\n)+\s*[\w.#][^{]*,\s*\n(\s*\n)*\s*\}/g, '{ }');

// Remove empty rules
css = css.replace(/[^{}@\n][^{}]*\{\s*\}/g, '');

// Collapse blanks
css = css.replace(/\n{4,}/g, '\n\n\n').trim() + '\n';

fs.writeFileSync('renderer/src/index.css', css);
console.log('Deep fix complete. Lines:', css.split('\n').length, 'Passes:', passes);
