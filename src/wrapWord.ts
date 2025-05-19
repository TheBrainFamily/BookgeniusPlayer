export const wrapWord = (previousWordIndex: number, word: string, element: HTMLElement): {innerHtml: string, wordIndex: number} => {
    const text = element.innerHTML;
    
    // Get all text nodes and create a flat array of words with their indices
    const textContent = element.textContent || '';
    const words = textContent.split(/\s+/).filter(w => w.length > 0);
    
    // Find the word after the previous index
    let wordIndex = -1;
    for (let i = 0; i < words.length; i++) {
      if (words[i] === word && i > previousWordIndex) {
        wordIndex = i;
        break;
      }
    }
    
    if (wordIndex === -1) {
      return { innerHtml: element.innerHTML, wordIndex: -1 };
    }
    
    const wordsToWrap = words.slice(wordIndex);
    console.log('wordsToWrap', wordsToWrap);

    // Create wrapped HTML with span element
    // This is a simplistic approach - a more robust solution would use a DOM parser
    const newText = wordsToWrap.join(' ');
    const wrappedHtml = text.replace(
      word, 
      `<span class="current-word" data-nth-word="${wordIndex}">${word}</span>`
    );
    
    return { innerHtml: wrappedHtml, wordIndex };
  }