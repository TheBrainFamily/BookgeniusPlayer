/**
 * Shared DOM helpers for XML processing.
 *
 * These helpers are used by both xmlProcessor.ts and chapterProcessor.ts
 * for consistent XML-to-HTML conversion.
 */

// =============================================================================
// Constants
// =============================================================================

export const LINE_BREAK_SPAN =
  '<span style="display:block; height:0; margin:0; padding:0; line-height:1.2em;"></span>';

// =============================================================================
// Type Guards
// =============================================================================

export const isElementNode = (node: Node): node is Element => node.nodeType === 1;

export const isTextNode = (node: Node): node is Text => node.nodeType === 3;

// =============================================================================
// Helper Functions
// =============================================================================

export const renderLineBreakSpan = () => LINE_BREAK_SPAN;

export const isLikelyCharacterTag = (tag: string) => {
  const first = tag.charAt(0);
  return first === first.toUpperCase() && /[A-Z]/.test(first);
};

export const renderEmElement = (element: Element): string => {
  let emInner = "";
  for (const emChild of Array.from(element.childNodes)) {
    if (isTextNode(emChild)) {
      emInner += emChild.textContent || "";
    } else if (isElementNode(emChild)) {
      if (emChild.tagName === "LineBreak") {
        emInner += renderLineBreakSpan();
      } else if (isLikelyCharacterTag(emChild.tagName)) {
        // Preserve character elements with enters/exits attributes
        const slug = emChild.tagName.toLowerCase();
        const isEntering = emChild.getAttribute("enters") === "true";
        const isExiting = emChild.getAttribute("exits") === "true";
        const dataAttrs = [`data-c="${slug}"`];
        if (isEntering) dataAttrs.push('data-enters="true"');
        if (isExiting) dataAttrs.push('data-exits="true"');
        emInner += `<span ${dataAttrs.join(" ")}>${emChild.textContent || ""}</span>`;
      } else {
        emInner += emChild.textContent || "";
      }
    }
  }
  if (element.hasAttribute("class")) {
    return `<em class="${element.getAttribute("class")}">${emInner}</em>`;
  }
  return `<em>${emInner}</em>`;
};

// =============================================================================
// Types
// =============================================================================

export type InlineRenderOptions = { bookSlug: string; includeBookSlugInImgSrc?: boolean };
