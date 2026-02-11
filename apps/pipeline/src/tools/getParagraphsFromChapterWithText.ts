import * as cheerio from "cheerio";
import {
  forEachIndexedMixedFormatLeaf,
  MIXED_FORMAT_CONTAINER_TAGS,
} from "@player/services/mixedFormatLeafIndexing";
import type { ContainerInfo } from "./chapterChunker";

/**
 * Extract attributes from a cheerio element
 */
function getElementAttributes($elem: {
  attr(): Record<string, string | null> | undefined;
}): Record<string, string> {
  const attrs: Record<string, string> = {};
  const rawAttrs = $elem.attr();
  if (rawAttrs) {
    for (const [key, value] of Object.entries(rawAttrs)) {
      if (typeof value === "string") {
        attrs[key] = value;
      }
    }
  }
  return attrs;
}

function getImagePlaceholderText(attributes: Record<string, string>): string {
  const alt = attributes.alt?.trim();
  if (alt) {
    return `[Image: ${alt}]`;
  }
  const ariaLabel = attributes["aria-label"]?.trim();
  if (ariaLabel) {
    return `[Image: ${ariaLabel}]`;
  }
  const title = attributes.title?.trim();
  if (title) {
    return `[Image: ${title}]`;
  }
  return "[Image]";
}

function getNonTextPlaceholder(
  elementType: string,
  attributes: Record<string, string>,
): string | null {
  if (elementType === "img") {
    return getImagePlaceholderText(attributes);
  }
  if (elementType === "hr") {
    return "[Section break]";
  }
  return null;
}

export const getParagraphsFromChapterWithText = (
  chapter: number,
  bookText: string,
  clean: boolean = false,
  pureText = false,
  passed$?: cheerio.CheerioAPI,
) => {
  const $ = passed$ ?? cheerio.load(bookText);
  const chapterSectionEl = $(`[data-chapter="${chapter}"]`).first();
  const chapterSection = chapterSectionEl.get(0)!;
  const chapterRoots = chapterSectionEl.children().toArray();
  type ChapterNode = (typeof chapterRoots)[number];
  const indexedLeaves: Array<{ node: ChapterNode; dataIndex: number }> = [];

  forEachIndexedMixedFormatLeaf(
    chapterRoots,
    {
      getTagName: (node) => {
        const tagName = $(node).prop("tagName");
        return typeof tagName === "string" ? tagName : undefined;
      },
      getTextContent: (node) => $(node).text(),
      getChildren: (node) => $(node).children().toArray() as ChapterNode[],
    },
    (node, dataIndex) => {
      indexedLeaves.push({ node, dataIndex });
    },
  );

  // Stable container ID assignment across all leaves
  const containerIdMap = new Map<ChapterNode, string>();
  let nextContainerId = 0;

  /**
   * Walk up from a leaf node to the chapter section root, collecting container ancestors.
   * Returns outermost-first array, or undefined if the leaf is a direct child of the section.
   */
  function getContainerAncestry(node: ChapterNode): ContainerInfo[] | undefined {
    const chain: ContainerInfo[] = [];
    let current: ChapterNode | undefined = $(node).parent().get(0) as ChapterNode | undefined;

    while (current && current !== (chapterSection as unknown)) {
      const tag = ($(current).prop("tagName") ?? "").toLowerCase();
      if (MIXED_FORMAT_CONTAINER_TAGS.has(tag)) {
        let id = containerIdMap.get(current);
        if (id === undefined) {
          id = `c${nextContainerId++}`;
          containerIdMap.set(current, id);
        }
        chain.push({ id, tagName: tag, attributes: getElementAttributes($(current)) });
      }
      current = $(current).parent().get(0) as ChapterNode | undefined;
    }

    if (chain.length === 0) return undefined;
    // chain is innermost-first, reverse to get outermost-first
    return chain.reverse();
  }

  return indexedLeaves
    .map(({ node, dataIndex }) => {
      const $elem = $(node);
      const elementType = ($elem.prop("tagName") ?? "unknown").toLowerCase();
      const attributes = getElementAttributes($elem);
      const $clone = $elem.clone();
      if (clean) {
        $clone.find("note").remove();
        $clone.find("a").remove();
      }
      let rawText = pureText ? $clone.text().trim() : ($clone.html()?.trim() ?? "");

      if (!rawText && !pureText) {
        // For void elements (hr, img, etc.), $.html($clone) returns the element's
        // own markup (e.g. "<hr>"), not its content. Skip this fallback for them.
        const placeholder = getNonTextPlaceholder(elementType, attributes);
        rawText = placeholder ?? $.html($clone).trim();
      }

      if (!rawText) {
        rawText = getNonTextPlaceholder(elementType, attributes) ?? "";
      }

      const text = rawText
        .replace(/\s+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();

      const containers = getContainerAncestry(node);

      return { text, dataIndex, elementType, attributes, containers };
    })
    .filter((element) => element.text.length > 0);
};

/**
 * Extract section-level attributes from a chapter (e.g., data-epub-type, data-chapter-format)
 * These are needed to preserve semantic information when rewrapping sections after AI processing.
 */
export const getSectionAttributes = (
  chapter: number,
  bookText: string,
  passed$?: cheerio.CheerioAPI,
): Record<string, string> => {
  const $ = passed$ ?? cheerio.load(bookText);
  const section = $(`[data-chapter="${chapter}"]`);
  if (section.length === 0) return {};

  const attrs: Record<string, string> = {};
  const rawAttrs = section.attr();
  if (rawAttrs) {
    for (const [key, value] of Object.entries(rawAttrs)) {
      // Preserve semantic attributes but skip data-chapter (will be re-added)
      if (value !== undefined && key !== "data-chapter") {
        attrs[key] = value;
      }
    }
  }
  return attrs;
};
