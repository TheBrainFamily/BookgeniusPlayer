const fs = require('fs');
const path = require('path');

const booksDir = '/Users/lukaszgandecki/projects/bookgenius/frontend/books';
const counts = {};
const examples = {};

// Find all XML files
const bookDirs = fs.readdirSync(booksDir).filter(d => {
  const stat = fs.statSync(path.join(booksDir, d));
  return stat.isDirectory();
});

for (const bookDir of bookDirs) {
  const contentDir = path.join(booksDir, bookDir, 'booksContent');
  if (!fs.existsSync(contentDir)) continue;

  const xmlFiles = fs.readdirSync(contentDir).filter(f => f.endsWith('.xml'));

  for (const xmlFile of xmlFiles) {
    const filePath = path.join(contentDir, xmlFile);
    const xml = fs.readFileSync(filePath, 'utf-8');

    // Find all <Chapter ...> sections
    const chapterRegex = /<Chapter[^>]*>([\s\S]*?)<\/Chapter>/g;
    let match;
    while ((match = chapterRegex.exec(xml)) !== null) {
      const chapterContent = match[1];

      // Find direct children (elements at the start of lines or after >)
      // Match opening tags that are direct children of Chapter
      const directChildRegex = /(?:^|\n)\s*<([a-zA-Z][a-zA-Z0-9_-]*)(?:\s[^>]*)?(?:>|\/\s*>)/g;
      let childMatch;

      while ((childMatch = directChildRegex.exec(chapterContent)) !== null) {
        const tag = childMatch[1];
        counts[tag] = (counts[tag] || 0) + 1;
        if (!examples[tag]) {
          // Get context around this match
          const start = Math.max(0, childMatch.index);
          const end = Math.min(chapterContent.length, childMatch.index + 300);
          examples[tag] = {
            book: bookDir,
            file: xmlFile,
            example: chapterContent.slice(start, end)
          };
        }
      }
    }
  }
}

// Sort by count
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

console.log('=== Direct Children of <Chapter> Elements ===\n');
console.log('Count\tElement');
console.log('-----\t-------');
for (const [tag, count] of sorted) {
  console.log(count + '\t<' + tag + '>');
}

console.log('\n=== Examples (first 25) ===\n');
for (const [tag] of sorted.slice(0, 25)) {
  const ex = examples[tag];
  console.log('<' + tag + '> from ' + ex.book + '/' + ex.file + ':');
  const cleanExample = ex.example.replace(/\n/g, ' ').replace(/\s+/g, ' ').slice(0, 180);
  console.log('  ' + cleanExample + '...');
  console.log('');
}
