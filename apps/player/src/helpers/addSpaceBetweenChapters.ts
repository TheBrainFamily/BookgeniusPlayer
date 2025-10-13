export const addSpaceBetweenChapters = (doc: Document, chapters: Element[]) => {
  chapters.slice(0, -1).forEach((section) => {
    const chapterNumber = section.getAttribute("data-chapter");
    if (chapterNumber) {
      console.log(`chapterNumber: ${chapterNumber}`);
      const spacer = doc.createElement("div");
      spacer.className = "transition-spacer";
      spacer.setAttribute("data-chapter-end", chapterNumber);
      spacer.setAttribute("data-next-chapter-start", (parseInt(chapterNumber, 10) + 1).toString());
      spacer.style.userSelect = "none";
      spacer.style.webkitUserSelect = "none";
      spacer.style.pointerEvents = "none";
      spacer.style.height = "100vh";
      section.after(spacer);
    }
  });
};
