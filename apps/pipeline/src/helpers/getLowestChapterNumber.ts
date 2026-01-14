export const getLowestChapterNumber = (xmlContent: string): number => {
  const chapterNumberRegex = /<chapter number="(\d+)">/g;
  let match;
  let lowestNumber = 10000;

  while ((match = chapterNumberRegex.exec(xmlContent)) !== null) {
    const chapterNumber = parseInt(match[1], 10);
    if (chapterNumber < lowestNumber) {
      lowestNumber = chapterNumber;
    }
  }

  return lowestNumber;
};
