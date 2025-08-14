export const addPaddingBottomLastChapter = (doc: Document, chapters: Element[]) => {
  const lastChapter = chapters[chapters.length - 1];
  const finalPadding = doc.createElement("div");
  finalPadding.style.height = "50vh";
  lastChapter.appendChild(finalPadding);
};
