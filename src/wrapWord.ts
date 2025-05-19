export const wrapWord = (word: string, words: string[]): { foundWordIndex: number } => {
  // Get all text nodes and create a flat array of words with their indices
  // const textContent = element.textContent || '';
  // const words = textContent.split(/\s+/).filter(w => w.length > 0);

  // Find the word after the previous index
  let foundWordIndex = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i] === word) {
      console.log("MATCH FOUND!", words[i], word);
      foundWordIndex = i;
      break;
    }
  }

  if (foundWordIndex === -1) {
    return { foundWordIndex: -1 };
  }

  const wordsToWrap = words.slice(foundWordIndex);
  console.log("wordsToWrap", wordsToWrap);

  // Create wrapped HTML with span element
  // This is a simplistic approach - a more robust solution would use a DOM parser
  // const newText = wordsToWrap.join(' ');
  // const wrappedHtml = text.replace(
  //   word,
  //   `<span class="current-word" data-nth-word="${wordIndex}">${word}</span>`
  // );

  return { foundWordIndex };
};
