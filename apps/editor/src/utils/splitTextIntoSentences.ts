export const splitTextIntoSentences = (text: string): string[] => {
  const sentences = text.split(/(?<=[!?.])/).map(sentence => sentence.trim()).filter(sentence => sentence.length > 0);
  return sentences.length > 0 ? sentences : [text];
};