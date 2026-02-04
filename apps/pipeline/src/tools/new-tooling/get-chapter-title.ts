import { type Element as XMLElement } from "@xmldom/xmldom";

const getTitleText = (el?: XMLElement | null) => (el ? (el.textContent || "").trim() : "");

const getAttribute = (el: XMLElement, name: string): string | null => {
  const attr = el.getAttribute(name);
  return attr ? attr.trim() : null;
};

const hasEpubType = (el: XMLElement, type: string): boolean => {
  const epubType = getAttribute(el, "data-epub-type");
  return epubType ? epubType.includes(type) : false;
};

const extractLabelAndOrdinalFromSpans = (h2: XMLElement): { label: string; ordinal: string } => {
  let label = "";
  let ordinal = "";

  const spans = h2.getElementsByTagName("span");
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i] as XMLElement;
    const spanEpubType = getAttribute(span, "data-epub-type");
    if (spanEpubType === "label") {
      label = getTitleText(span);
    } else if (spanEpubType && spanEpubType.includes("ordinal")) {
      ordinal = getTitleText(span);
    }
  }

  return { label, ordinal };
};

const formatTitleWithOrdinal = (label: string, ordinal: string, title: string): string => {
  if (label && ordinal) {
    return `${label} ${ordinal}: ${title}`;
  }
  if (ordinal) {
    return `${ordinal}: ${title}`;
  }
  return title;
};

const getTitleFromHgroup = (hgroup: XMLElement): string | null => {
  const titleParagraphs = Array.from(hgroup.getElementsByTagName("p")).filter((p) =>
    hasEpubType(p as XMLElement, "title"),
  );

  if (titleParagraphs.length === 0) {
    return null;
  }

  const titleText = getTitleText(titleParagraphs[0] as XMLElement);
  const h2Elements = hgroup.getElementsByTagName("h2");

  if (h2Elements.length === 0) {
    return titleText;
  }

  const h2 = h2Elements[0] as XMLElement;

  // Check if h2 itself has ordinal attribute
  if (hasEpubType(h2, "ordinal")) {
    return formatTitleWithOrdinal("", getTitleText(h2), titleText);
  }

  // Check for spans within h2
  const { label, ordinal } = extractLabelAndOrdinalFromSpans(h2);
  return formatTitleWithOrdinal(label, ordinal, titleText);
};

const getLegacyChapterTitle = (chapter: XMLElement): string => {
  let currentAct = "";

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

  console.log(`titleElements: ${titleElements.length}`);

  const titleText = getTitleText(titleElements[0]);
  const subtitleText = getTitleText(subtitleElements[0]);

  return [
    currentAct,
    titleText && subtitleText ? titleText.replace(/\.$/, "") : titleText,
    subtitleText,
  ]
    .filter(Boolean)
    .join(", ");
};

export const getChapterTitle = (chapter: XMLElement): string => {
  // Check for hgroup structure first
  const hgroups = chapter.getElementsByTagName("hgroup");
  if (hgroups.length > 0) {
    const hgroupTitle = getTitleFromHgroup(hgroups[0] as XMLElement);
    if (hgroupTitle) {
      return hgroupTitle;
    }
  }

  // If no hgroup with title, check for data-epub-type on the root element
  const epubType = getAttribute(chapter, "data-epub-type");
  if (epubType) {
    return epubType.charAt(0).toUpperCase() + epubType.slice(1);
  }

  // Fall back to existing logic for backward compatibility
  return getLegacyChapterTitle(chapter);
};
