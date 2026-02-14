const getTitleText = (el?: Element | null) => (el ? (el.textContent || "").trim() : "");

const HEADING_TAGS = ["h2", "h3", "h4", "h5", "h6"] as const;

/** Find the first heading element (h2–h6) in the given root. */
const findFirstHeading = (root: Element): Element | null => {
  for (const tag of HEADING_TAGS) {
    const els = root.getElementsByTagName(tag);
    if (els.length > 0) return els[0];
  }
  return null;
};

const getAttribute = (el: Element, name: string): string | null => {
  const attr = el.getAttribute(name);
  return attr ? attr.trim() : null;
};

const hasEpubType = (el: Element, type: string): boolean => {
  const epubType = getAttribute(el, "data-epub-type");
  return epubType ? epubType.includes(type) : false;
};

const extractLabelAndOrdinalFromSpans = (h2: Element): { label: string; ordinal: string } => {
  let label = "";
  let ordinal = "";

  const spans = h2.getElementsByTagName("span");
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
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

/**
 * Clean an epub-type string: strip z3998: prefixed tokens and se: prefixed tokens,
 * return the first meaningful token capitalized (e.g. "chapter z3998:diary" → "Chapter",
 * "z3998:frontispiece" → "Frontispiece").
 */
const cleanEpubType = (raw: string): string | null => {
  const tokens = raw.split(/\s+/);
  for (const token of tokens) {
    if (token.startsWith("z3998:")) {
      // Use the part after z3998: only if no plain token exists
      continue;
    }
    if (token.startsWith("se:")) continue;
    return token.charAt(0).toUpperCase() + token.slice(1);
  }
  // All tokens were namespaced — use the first z3998: one without prefix
  for (const token of tokens) {
    if (token.startsWith("z3998:")) {
      const clean = token.slice("z3998:".length);
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }
  }
  return null;
};

/**
 * Find the epub-type label from a section element — either the root itself
 * or the first section descendant. Returns cleaned, capitalized label.
 */
const findSectionEpubType = (root: Element): string | null => {
  let epubType = getAttribute(root, "data-epub-type");
  if (!epubType) {
    const sections = root.getElementsByTagName("section");
    for (let i = 0; i < sections.length; i++) {
      epubType = getAttribute(sections[i], "data-epub-type");
      if (epubType) break;
    }
  }
  if (!epubType) return null;
  return cleanEpubType(epubType);
};

const formatLabelOrdinal = (label: string, ordinal: string): string | null => {
  if (label && ordinal) return `${label} ${ordinal}`;
  if (ordinal) return ordinal;
  if (label) return label;
  return null;
};

const getTitleFromHgroup = (hgroup: Element): string | null => {
  const titleParagraphs = Array.from(hgroup.getElementsByTagName("p")).filter((p) =>
    hasEpubType(p, "title"),
  );
  const h2Elements = hgroup.getElementsByTagName("h2");

  if (titleParagraphs.length === 0) {
    // No title paragraph — try to build title from h2 label+ordinal spans
    if (h2Elements.length === 0) return null;
    const h2 = h2Elements[0];
    const { label, ordinal } = extractLabelAndOrdinalFromSpans(h2);
    return formatLabelOrdinal(label, ordinal);
  }

  const titleText = getTitleText(titleParagraphs[0]);

  if (h2Elements.length === 0) {
    return titleText;
  }

  const h2 = h2Elements[0];

  // Check if h2 itself has ordinal attribute
  if (hasEpubType(h2, "ordinal")) {
    return formatTitleWithOrdinal("", getTitleText(h2), titleText);
  }

  // Check for spans within h2
  const { label, ordinal } = extractLabelAndOrdinalFromSpans(h2);
  return formatTitleWithOrdinal(label, ordinal, titleText);
};

const getLegacyChapterTitle = (chapter: Element): string => {
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

export const getChapterTitle = (chapter: Element): string => {
  // Check for hgroup structure first
  const hgroups = chapter.getElementsByTagName("hgroup");
  if (hgroups.length > 0) {
    const hgroupTitle = getTitleFromHgroup(hgroups[0]);
    if (hgroupTitle) {
      return hgroupTitle;
    }
  }

  // Check for a direct heading (h2–h6) with label+ordinal spans or ordinal attribute
  const heading = findFirstHeading(chapter);
  if (heading) {
    // Heading with data-epub-type="title" is a standalone title (e.g. "Introduction")
    if (hasEpubType(heading, "title")) {
      return getTitleText(heading);
    }
    const { label, ordinal } = extractLabelAndOrdinalFromSpans(heading);
    const labelOrdinal = formatLabelOrdinal(label, ordinal);
    if (labelOrdinal) return labelOrdinal;

    // Heading with ordinal directly on itself (e.g. <h3 data-epub-type="ordinal z3998:roman">I</h3>)
    if (hasEpubType(heading, "ordinal")) {
      const sectionLabel = findSectionEpubType(chapter);
      const ordinalText = getTitleText(heading);
      if (sectionLabel && ordinalText) {
        return `${sectionLabel} ${ordinalText}`;
      }
      if (ordinalText) return ordinalText;
    }
  }

  // Check for data-epub-type on root or first section descendant
  const epubType = findSectionEpubType(chapter);
  if (epubType) {
    return epubType;
  }

  // Fall back to existing logic for backward compatibility
  return getLegacyChapterTitle(chapter);
};
