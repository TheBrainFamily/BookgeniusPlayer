const fs = require('fs');

const inputFile = 'styles.css';
const outputFile = 'styles-scoped.css';

const css = fs.readFileSync(inputFile, 'utf8');

const scopedCss = css.replace(/(^|})(\s*)([^@}{\/][^{]*?)\{/g, (match, p1, p2, selector) => {
  const trimmedSelector = selector.trim();
  
  // Skip root-level selectors like :root, @keyframes, and comments
  if (
    trimmedSelector.startsWith(':root') ||
    trimmedSelector.startsWith('@') ||
    trimmedSelector.startsWith('/*') ||
    trimmedSelector.startsWith('from') ||
    trimmedSelector.startsWith('to') ||
    trimmedSelector.match(/^\d/)
  ) {
    return match;
  }

  // Scope multiple selectors individually
  const scopedSelectors = trimmedSelector
    .split(',')
    .map(s => `#legacy ${s.trim()}`)
    .join(', ');

  return `${p1}${p2}${scopedSelectors} {`;
});

fs.writeFileSync(outputFile, scopedCss);

console.log(`✅ Scoped CSS written to ${outputFile}`);
