import type { Location } from "@player/state/LocationContext";

type RectLike = Pick<DOMRectReadOnly, "top" | "bottom" | "left" | "right">;

type VisibleRange = Pick<
  Location,
  | "earliestVisibleChapter"
  | "earliestVisibleParagraph"
  | "latestVisibleChapter"
  | "latestVisibleParagraph"
>;

const MIN_OVERLAP_PX = 1;
const CHARACTER_MENTION_SELECTOR = "span[data-c][data-character]";

function parseNumericAttr(rawValue: string | null): number | null {
  if (rawValue == null) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareChapterParagraph(
  a: { chapter: number; paragraph: number },
  b: { chapter: number; paragraph: number },
): number {
  if (a.chapter !== b.chapter) {
    return a.chapter - b.chapter;
  }
  return a.paragraph - b.paragraph;
}

export function parseSpeakerSlugs(speakerAttr: string | null): string[] {
  if (!speakerAttr) {
    return [];
  }
  return speakerAttr
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function getContentViewportRect(contentContainer: HTMLElement): RectLike {
  return contentContainer.getBoundingClientRect();
}

export function isRectIntersectingViewport(
  rect: RectLike,
  viewportRect: RectLike,
  minOverlapPx = MIN_OVERLAP_PX,
): boolean {
  const verticalOverlap =
    Math.min(rect.bottom, viewportRect.bottom) - Math.max(rect.top, viewportRect.top);
  const horizontalOverlap =
    Math.min(rect.right, viewportRect.right) - Math.max(rect.left, viewportRect.left);

  return verticalOverlap >= minOverlapPx && horizontalOverlap > 0;
}

export function isElementVisibleInViewport(
  element: Element,
  viewportRect: RectLike,
  minOverlapPx = MIN_OVERLAP_PX,
): boolean {
  return isRectIntersectingViewport(element.getBoundingClientRect(), viewportRect, minOverlapPx);
}

export function isInlineMentionVisible(
  mentionElement: Element,
  viewportRect: RectLike,
  minOverlapPx = MIN_OVERLAP_PX,
): boolean {
  const lineRects = Array.from(mentionElement.getClientRects());

  if (lineRects.length === 0) {
    return false;
  }

  return lineRects.some((lineRect) =>
    isRectIntersectingViewport(lineRect, viewportRect, minOverlapPx),
  );
}

export function extractSpeakerSlugs(paragraphElement: HTMLElement): Set<string> {
  const slugs = new Set<string>();

  parseSpeakerSlugs(paragraphElement.getAttribute("data-speaker")).forEach((slug) => {
    slugs.add(slug);
  });

  parseSpeakerSlugs(
    paragraphElement.parentElement?.closest("[data-speaker]")?.getAttribute("data-speaker") ?? null,
  ).forEach((slug) => {
    slugs.add(slug);
  });

  return slugs;
}

export function extractVisibleMentionSlugs(
  paragraphElement: HTMLElement,
  viewportRect: RectLike,
): Set<string> {
  const slugs = new Set<string>();
  const mentions = paragraphElement.querySelectorAll<HTMLElement>(CHARACTER_MENTION_SELECTOR);

  mentions.forEach((mentionElement) => {
    if (!isInlineMentionVisible(mentionElement, viewportRect)) {
      return;
    }

    const slug =
      mentionElement.getAttribute("data-character") ?? mentionElement.getAttribute("data-c");
    if (slug) {
      slugs.add(slug);
    }
  });

  return slugs;
}

export function getParagraphElementsInVisibleRange(
  contentContainer: HTMLElement,
  visibleRange: VisibleRange,
): HTMLElement[] {
  const start = {
    chapter: visibleRange.earliestVisibleChapter,
    paragraph: visibleRange.earliestVisibleParagraph,
  };
  const end = {
    chapter: visibleRange.latestVisibleChapter,
    paragraph: visibleRange.latestVisibleParagraph,
  };

  const [rangeStart, rangeEnd] =
    compareChapterParagraph(start, end) <= 0 ? [start, end] : [end, start];

  const paragraphs: HTMLElement[] = [];
  const sections = contentContainer.querySelectorAll<HTMLElement>("section[data-chapter]");

  sections.forEach((section) => {
    const chapter = parseNumericAttr(section.getAttribute("data-chapter"));
    if (chapter == null || chapter < rangeStart.chapter || chapter > rangeEnd.chapter) {
      return;
    }

    const lowerParagraphBound =
      chapter === rangeStart.chapter ? rangeStart.paragraph : Number.NEGATIVE_INFINITY;
    const upperParagraphBound =
      chapter === rangeEnd.chapter ? rangeEnd.paragraph : Number.POSITIVE_INFINITY;

    section.querySelectorAll<HTMLElement>("[data-index]").forEach((paragraphElement) => {
      const paragraph = parseNumericAttr(paragraphElement.getAttribute("data-index"));
      if (paragraph == null) {
        return;
      }

      if (paragraph >= lowerParagraphBound && paragraph <= upperParagraphBound) {
        paragraphs.push(paragraphElement);
      }
    });
  });

  paragraphs.sort((a, b) => {
    const aSection = a.closest("section[data-chapter]");
    const bSection = b.closest("section[data-chapter]");
    const aChapter = parseNumericAttr(aSection?.getAttribute("data-chapter") ?? null) ?? 0;
    const bChapter = parseNumericAttr(bSection?.getAttribute("data-chapter") ?? null) ?? 0;
    const aParagraph = parseNumericAttr(a.getAttribute("data-index")) ?? 0;
    const bParagraph = parseNumericAttr(b.getAttribute("data-index")) ?? 0;
    return compareChapterParagraph(
      { chapter: aChapter, paragraph: aParagraph },
      { chapter: bChapter, paragraph: bParagraph },
    );
  });

  return paragraphs;
}

export function collectVisibleCharacterSlugs(
  paragraphElements: HTMLElement[],
  viewportRect: RectLike,
): Set<string> {
  const slugs = new Set<string>();

  paragraphElements.forEach((paragraphElement) => {
    if (!isElementVisibleInViewport(paragraphElement, viewportRect)) {
      return;
    }

    extractSpeakerSlugs(paragraphElement).forEach((slug) => slugs.add(slug));
    extractVisibleMentionSlugs(paragraphElement, viewportRect).forEach((slug) => slugs.add(slug));
  });

  return slugs;
}
