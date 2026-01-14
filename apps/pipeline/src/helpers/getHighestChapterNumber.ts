export const getHighestChapterNumber = (xmlContent: string): number => {
  const chapterNumberRegex = /<chapter number="(\d+)">/g;
  let match;
  let highestNumber = 0;

  while ((match = chapterNumberRegex.exec(xmlContent)) !== null) {
    const chapterNumber = parseInt(match[1], 10);
    if (chapterNumber > highestNumber) {
      highestNumber = chapterNumber;
    }
  }

  return highestNumber;
};
