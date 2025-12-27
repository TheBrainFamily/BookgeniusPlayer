import { Element as XMLElement } from "@xmldom/xmldom";

const getTitleText = (el?: XMLElement | null) => (el ? (el.textContent || "").trim() : "");

export const getChapterTitle = (chapter: XMLElement): string => {
  let currentAct = "";

  if (chapter.getElementsByTagName("h2").length > 0) {
    console.warn("h2 found in chapter, not supported yet", chapter);
  }
  if (chapter.getElementsByTagName("h1").length > 0) {
    console.warn("h1 found in chapter, not supported yet", chapter);
  }

  const actElements =
    chapter.getElementsByTagName("h3").length > 0
      ? chapter.getElementsByTagName("h3")
      : chapter.getElementsByTagName("Act");

  const titleElements =
    chapter.getElementsByTagName("h4").length > 0
      ? chapter.getElementsByTagName("h4")
      : chapter.getElementsByTagName("Title");

  const subtitleElements =
    chapter.getElementsByTagName("h5").length > 0
      ? chapter.getElementsByTagName("h5")
      : chapter.getElementsByTagName("Subtitle");

  if (actElements.length > 0) {
    currentAct = getTitleText(actElements[0]);
  }

  const titleText = getTitleText(titleElements[0]);
  const subtitleText = getTitleText(subtitleElements[0]);

  const chapterTitle = [currentAct, titleText && subtitleText ? titleText.replace(/\.$/, "") : titleText, subtitleText]
    .filter(Boolean)
    .join(", ");

  return chapterTitle;
};
