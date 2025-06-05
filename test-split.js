const paragraphText = "text mowe<note id=1/>slowo";

// First split by HTML tags
const parts = paragraphText.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);

// Process each part
let words = [];
for (const part of parts) {
  if (part.trim()) {
    if (part.match(/<[^>]+>.*?<\/[^>]+>|<[^>]+\/>/)) {
      // Keep the tag
      words.push(part);
    } else {
      // Process regular text, but first split by potential attached tags
      const subParts = part.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);
      for (const subPart of subParts) {
        if (subPart.trim()) {
          if (subPart.match(/<[^>]+>.*?<\/[^>]+>|<[^>]+\/>/)) {
            words.push(subPart);
          } else {
            words.push(
              ...subPart
                .split(/\s+/)
                .map((w) => w.replace(/[.,!?;:()[\]{}"'\-–—]/g, ""))
                .filter((w) => w.length > 0 && /[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(w)),
            );
          }
        }
      }
    }
  }
}

console.log(JSON.stringify(words, null, 2));
