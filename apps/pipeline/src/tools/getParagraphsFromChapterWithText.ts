import * as cheerio from "cheerio";

/**
 * Extract attributes from a cheerio element
 */
function getElementAttributes($elem: ReturnType<cheerio.CheerioAPI>): Record<string, string> {
  const attrs: Record<string, string> = {};
  const rawAttrs = $elem.attr();
  if (rawAttrs) {
    for (const [key, value] of Object.entries(rawAttrs)) {
      if (value !== undefined) {
        attrs[key] = value;
      }
    }
  }
  return attrs;
}

export const getParagraphsFromChapterWithText = (
  chapter: number,
  bookText: string,
  clean: boolean = false,
  pureText = false,
  passed$?: cheerio.CheerioAPI,
) => {
  const $ = passed$ ?? cheerio.load(bookText);
  return Array.from($(`[data-chapter="${chapter}"] > *`))
    .map((elem) => {
      const $elem = $(elem);
      const elementType = ($elem.prop("tagName") ?? "unknown").toLowerCase();
      const attributes = getElementAttributes($elem);
      const $clone = $elem.clone();
      if (clean) {
        $clone.find("note").remove();
        $clone.find("a").remove();
      }
      let text = "";
      if (pureText) {
        text = $clone.text().trim();
      } else {
        text = $clone.html()?.trim() ?? "";
      }

      return { text, elementType, attributes };
    })
    .filter((element) => element?.text.length > 0)
    .map((pageText, index) => {
      const text = pageText.text
        .replace(/\u2019/g, "'")
        .replace(/\u2018/g, "'")
        .replace(/\u2013/g, "-")
        .replace(/\u2014/g, "—")
        .replace(/\s+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();
      return {
        text,
        dataIndex: index,
        elementType: pageText.elementType,
        attributes: pageText.attributes,
      };
    });
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
