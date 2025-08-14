export const addPaddingBottomLastChapter = (doc: Document, chapters: Element[]) => {
  if (chapters.length === 0) return;

  const lastChapter = chapters[chapters.length - 1];
  const finalPadding = doc.createElement("div");
  finalPadding.style.height = "50vh";
  lastChapter.appendChild(finalPadding);
};
