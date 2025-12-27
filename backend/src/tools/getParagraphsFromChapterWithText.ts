import * as cheerio from "cheerio";

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
      const elementType = ($elem.prop("tagName") ?? "unknown").toLowerCase(); // Get the tag name, provide default
      // Clone the paragraph element to avoid modifying the original DOM structure if needed elsewhere
      const $clone = $elem.clone();
      // Remove all anchor elements with the class 'anchor' from the clone
      if (clean) {
        $clone.find("note").remove();
        $clone.find("a").remove();
      }
      let text = "";
      if (pureText) {
        text = $clone.text().trim();
      } else {
        // Get clean text content without anchors
        text = $clone.html()?.trim() ?? "";
      }

      return { text, elementType }; // Add elementType here
    })
    .filter((element) => element?.text.length > 0)
    .map((pageText, index) => {
      const text = pageText.text
        .replace(/\u201c/g, '"')
        .replace(/\u201d/g, '"')
        .replace(/\u2019/g, "'")
        .replace(/\u2018/g, "'")
        .replace(/\u2013/g, "-")
        .replace(/\u2014/g, "—")
        .replace(/\s+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();
      return { text, dataIndex: index, elementType: pageText.elementType }; // Keep elementType here
    });
};
