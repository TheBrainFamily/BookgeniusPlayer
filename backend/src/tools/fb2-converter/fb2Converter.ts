import { JSDOM } from "jsdom";

// --- Interfaces ---

export interface ConversionResult {
  chaptersXml: string;
  textHtml: string;
  lastChapter: number;
  lastNoteId: number;
}

export interface Fb2ConversionOptions {
  startFromChapter?: number;
  startFromNoteId?: number;
}

interface BinaryDataMap {
  [id: string]: { contentType: string; base64Data: string };
}

// --- Constants ---
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

// --- Helper Functions ---

/**
 * Checks if an element is a direct content block element (not title, annotation, etc.)
 * Used for chapter detection.
 * @param element The element to check.
 * @returns True if the element is a p, poem, cite, empty-line, table, or image.
 */
function isContentElement(element: Element): boolean {
  const contentTags = ["p", "poem", "cite", "empty-line", "table", "image"];
  return contentTags.includes(element.tagName.toLowerCase());
}

/**
 * Extracts the numerical ID from a string formatted like "#fnXXX".
 *
 * @param {string} hrefString The input string (e.g., "#fn182").
 * @returns {number | null} The extracted number as an integer, or null if the format doesn't match.
 */
/**
 * Extracts the numerical ID (as a string) from a string formatted like "#fnXXX".
 *
 * @param {string} hrefString The input string (e.g., "#fn182").
 * @returns {string | null} The extracted number as a string, or null if the format doesn't match.
 */
function extractNumberStringFromFnHref(hrefString: string): string {
  // Regex to match the start of the string (^),
  // followed by "#fn", then capture one or more digits (\d+),
  // followed by the end of the string ($).
  const regex = /^#fn(\d+)$/;

  // Attempt to match the string against the regex
  const match = hrefString.match(regex);

  // Check if the match was successful and the capturing group (the number) exists
  if (match && match[1]) {
    // match[1] is the content of the first capturing group (e.g., "182")
    // This is already a string, so just return it directly.
    return match[1];
  } else {
    // If the string doesn't match the expected format, return null
    return "0";
  }
}

/**
 * Identifies FB2 <section> elements that represent actual chapters.
 * A chapter must contain a direct <title> and at least one direct content element
 * (p, poem, cite, empty-line, table, image).
 * @param doc - The parsed FB2 Document.
 * @returns A Set containing the FB2 <section> Elements identified as chapters.
 */
function identifyChapterSections(doc: Document): Set<Element> {
  const chapterSections = new Set<Element>();
  const allSections = doc.querySelectorAll("section"); // Get all sections first

  console.log("allSections", [...allSections]);
  allSections.forEach((section) => {
    const hasTitle = section.querySelector(":scope > title") !== null;
    // Check if *any* direct child is a content element
    const hasContent = Array.from(section.children).some(isContentElement);

    if (hasTitle && hasContent) {
      chapterSections.add(section);
    }
  });

  return chapterSections;
}

/**
 * Identifies FB2 <section> elements that represent actual chapters.
 *
 * Some books don't have chapters, so we need to assume that the whole book is a single chapter.
 * We need to skip all commentary (notes) sections.
 * They always point to a specific place in the book, so they always have an id.
 * This id starts with "fn".
 *
 * @param doc - The parsed FB2 Document.
 * @returns A Set containing the FB2 <section> Elements identified as chapters.
 */
function identifyChapterInABookWithNoChapters(doc: Document): Set<Element> {
  const noChapterSections = new Set<Element>();
  const allSections = doc.querySelectorAll("section"); // Get all sections first
  console.log("allSections with no chapters", [...allSections]);
  allSections.forEach((section) => {
    // Notes sections are not chapters; they always have an id, starting with fn, as an anchor, we don't want to include them in the output
    const hasIdWithFn = section.getAttribute("id")?.startsWith("fn");

    // Check if *any* direct child is a content element
    const hasContent = Array.from(section.children).some(isContentElement);

    if (hasContent && !hasIdWithFn) {
      noChapterSections.add(section);
      console.log("noChapterSections", [...noChapterSections]);
    }
  });

  return noChapterSections;
}

// --- Core Parsing Logic ---

/**
 * Parses an XML string into a JSDOM Document object.
 * @param xmlString - The FB2 XML content as a string.
 * @returns The parsed Document object.
 * @throws Error if parsing fails.
 */
export function parseFb2Xml(xmlString: string): Document {
  try {
    // Add XML declaration if missing, as JSDOM might require it for XML mode
    const ensuredXmlString = xmlString.trim().startsWith("<?xml")
      ? xmlString
      : `<?xml version="1.0" encoding="UTF-8"?>${xmlString}`;

    const dom = new JSDOM(ensuredXmlString, {
      contentType: "application/xml", // Important for correct XML parsing
    });
    // Check for parser errors (optional but recommended)
    const parserErrors = dom.window.document.querySelector("parsererror");
    if (parserErrors) {
      console.error("XML Parsing Error:", parserErrors.textContent);
      throw new Error(`Failed to parse FB2 XML: ${parserErrors.textContent}`);
    }
    return dom.window.document;
  } catch (error) {
    console.error("Error initializing JSDOM or parsing FB2 XML:", error);
    throw new Error(`Failed to parse FB2 XML. Initial error: ${error}`);
  }
}

// --- Output 1: Simple Text XML Generation ---

/**
 * Recursively extracts text content from a node, skipping specified elements.
 * @param node - The DOM Node to extract text from.
 * @param excludeSelectors - CSS selectors for elements whose content should be excluded.
 * @returns The concatenated text content.
 */
function extractTextWithExclusions(node: Node, excludeSelectors: string[] = []): string {
  let text = "";
  if (node.nodeType === node.TEXT_NODE) {
    // Append text content, normalize whitespace later
    text += node.textContent || "";
  } else if (node.nodeType === node.ELEMENT_NODE) {
    const element = node as Element;
    // Check if this element should be excluded based on tag name or attributes
    let isExcluded = false;
    for (const selector of excludeSelectors) {
      // Simple tag name check
      if (selector.match(/^[a-zA-Z0-9]+$/) && element.tagName.toLowerCase() === selector.toLowerCase()) {
        isExcluded = true;
        break;
      }
      // Specific check for FB2 note links (adjust namespace if needed)
      // Handle potential missing attribute/namespace gracefully
      try {
        if (
          selector === 'a[type="note"]' &&
          element.tagName.toLowerCase() === "a" &&
          element.getAttribute("type") === "note"
        ) {
          isExcluded = true;
          break;
        }
        // Check using matches if selector is more complex (might be slower)
        // Note: jsdom's `matches` might have limitations
        if (!selector.match(/^[a-zA-Z0-9]+$/) && selector !== 'a[type="note"]' && element.matches(selector)) {
          isExcluded = true;
          break;
        }
      } catch (e) {
        // Ignore potential errors in matches() for unsupported selectors
        console.warn(`Could not evaluate selector "${selector}" on element <${element.tagName}>`, e);
      }
    }

    if (!isExcluded) {
      // Add space before processing children of block elements for better separation
      const blockTags = [
        "p",
        "title",
        "epigraph",
        "cite",
        "poem",
        "stanza",
        "section",
        "v",
        "tr",
        "th",
        "td",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
      ];
      if (blockTags.includes(element.tagName.toLowerCase())) {
        text += " ";
      }
      // Recursively process child nodes
      for (const child of Array.from(element.childNodes)) {
        text += extractTextWithExclusions(child, excludeSelectors);
      }
      // Add space after processing children of block elements
      if (blockTags.includes(element.tagName.toLowerCase())) {
        text += " ";
      }
    }
  }
  // Trim and normalize whitespace at the very end in the calling function
  return text;
}

/**
 * Escapes characters unsafe in XML text nodes.
 * @param text The input string.
 * @returns The escaped string.
 */
function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Note: &apos; and &quot; are typically needed for attributes, less so for text nodes,
  // but can be added if required: .replace(/'/g, '&apos;').replace(/"/g, '&quot;')
}

/**
 * Converts the parsed FB2 document into simple XML format with chapters.
 * Chapter titles are wrapped in a nested <title> tag.
 * @param doc - The parsed FB2 Document.
 * @param startChapterNumber - The number to start chapter counting from.
 * @returns A string containing the simple XML output.
 */
function convertToChaptersXml(doc: Document, startChapterNumber: number = 0): string {
  let chapterSectionsSet = identifyChapterSections(doc); // Use the refined identifier
  console.log("chapterSectionsSet", [...chapterSectionsSet]);
  // when the book has no chapters, we need to identify the main chapter in the book
  if (chapterSectionsSet.size === 0) {
    chapterSectionsSet = identifyChapterInABookWithNoChapters(doc);
  }

  // Optional: Sort sections based on document order if needed
  // uniqueChapterSections.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);

  const uniqueChapterSections = Array.from(chapterSectionsSet);

  const chaptersXml = uniqueChapterSections
    .map((section, index) => {
      let titleText = "";
      let bodyText = "";

      // 1. Find and extract title text
      const titleElement = section.querySelector(":scope > title");
      if (titleElement) {
        // Extract text only from the title element
        titleText = extractTextWithExclusions(titleElement, ['a[type="note"]']) // Exclude notes just in case
          .replace(/\s+/g, " ")
          .trim();
      }

      // 2. Extract body text (excluding title and other meta/structural elements)
      bodyText = extractTextWithExclusions(section, [
        "title", // <<< IMPORTANT: Exclude the title element now
        "epigraph",
        "annotation",
        "image", // Exclude image tags
        'a[type="note"]', // Exclude footnote link text
      ])
        .replace(/\s+/g, " ")
        .trim();

      // 3. Escape both parts for XML safety
      const escapedTitleText = escapeXml(titleText);
      const escapedBodyText = escapeXml(bodyText);

      // Add the startChapterNumber offset to the chapter number
      return `<chapter number="${index + startChapterNumber}"><title>${escapedTitleText}</title><content>${escapedBodyText}</content></chapter>`;
    })
    .join("\n"); // Join chapters with newlines

  // Add root element and newline for readability
  return `<chapters>\n${chaptersXml}\n</chapters>`;
}

// --- Output 2: Rich HTML5 Generation ---

/**
 * Extracts all binary data (like images) from the FB2 document.
 * @param doc - The parsed FB2 Document.
 * @returns A map where keys are binary IDs and values include content type and base64 data.
 */
function extractBinaryData(doc: Document): BinaryDataMap {
  const binaryMap: BinaryDataMap = {};
  const binaryElements = doc.querySelectorAll("binary[id]");
  binaryElements.forEach((el) => {
    const id = el.getAttribute("id");
    const contentType = el.getAttribute("content-type");
    const base64Data = el.textContent || "";
    if (id && contentType) {
      binaryMap[id] = { contentType, base64Data };
    }
  });
  return binaryMap;
}

/**
 * Transforms a single FB2 DOM node into its corresponding HTML DOM node(s).
 * Does NOT handle recursion for children directly but sets content for handled titles.
 * @param fb2Node - The FB2 node to transform.
 * @param htmlDoc - The target HTML Document.
 * @param binaryData - Map of available binary resources.
 * @param currentHeadingLevel - The current heading level (for section titles).
 * @returns The transformed HTML Node or null if the node should be skipped.
 */
function transformSingleNodeToHtml(
  fb2Node: Node,
  htmlDoc: Document,
  binaryData: BinaryDataMap,
  currentHeadingLevel: number,
): Node | null {
  if (fb2Node.nodeType === fb2Node.TEXT_NODE) {
    return htmlDoc.createTextNode(fb2Node.textContent || "");
  }

  if (fb2Node.nodeType !== fb2Node.ELEMENT_NODE) {
    return null;
  }

  const fb2Element = fb2Node as Element;
  const tagName = fb2Element.tagName.toLowerCase();
  let htmlElement: HTMLElement | DocumentFragment | null = null;

  switch (tagName) {
    case "p":
    case "v":
      htmlElement = htmlDoc.createElement("p");
      if (tagName === "v") htmlElement.classList.add("verse");
      break;
    case "title": {
      const parentTag = fb2Element.parentElement?.tagName?.toLowerCase();
      if (parentTag === "body" || parentTag === "section") {
        // --- MODIFICATION START ---
        const level = Math.min(6, currentHeadingLevel);
        htmlElement = htmlDoc.createElement(`h${level}`);
        // Extract text content from the FB2 title element's children
        const titleText = extractTextWithExclusions(fb2Element, ['a[type="note"]']); // Exclude notes just in case
        htmlElement.textContent = titleText.replace(/\s+/g, " ").trim(); // Set text content directly
        // --- MODIFICATION END ---
      } else {
        // --- MODIFICATION START ---
        htmlElement = htmlDoc.createElement("p");
        htmlElement.classList.add("inline-title");
        if (parentTag === "poem") htmlElement.classList.add("poem-title");
        if (parentTag === "epigraph") htmlElement.classList.add("epigraph-title");
        if (parentTag === "stanza") htmlElement.classList.add("stanza-title");
        // Extract text content from the FB2 title element's children
        const titleText = extractTextWithExclusions(fb2Element, ['a[type="note"]']);
        htmlElement.textContent = titleText.replace(/\s+/g, " ").trim(); // Set text content directly
        // --- MODIFICATION END ---
      }
      break;
    }
    // ... other cases remain the same (epigraph, cite, poem, etc.) ...
    case "epigraph":
      htmlElement = htmlDoc.createElement("div");
      htmlElement.classList.add("epigraph");
      break;
    case "i":
      htmlElement = htmlDoc.createElement("i");
      break;
    case "cite":
      htmlElement = htmlDoc.createElement("blockquote");
      htmlElement.classList.add("cite");
      break;
    case "poem":
      htmlElement = htmlDoc.createElement("div");
      htmlElement.classList.add("poem");
      break;
    case "stanza":
      htmlElement = htmlDoc.createElement("div");
      htmlElement.classList.add("stanza");
      break;
    case "text-author":
      htmlElement = htmlDoc.createElement("p");
      htmlElement.classList.add("text-author");
      break;
    case "empty-line":
      return htmlDoc.createElement("br");
    case "strong":
      htmlElement = htmlDoc.createElement("strong");
      break;
    case "emphasis":
      htmlElement = htmlDoc.createElement("em");
      break;
    case "strikethrough":
      htmlElement = htmlDoc.createElement("s");
      break;
    case "sub":
      htmlElement = htmlDoc.createElement("sub");
      break;
    case "sup":
      htmlElement = htmlDoc.createElement("sup");
      break;
    case "code":
      htmlElement = htmlDoc.createElement("code");
      break;
    case "style": {
      // Named style
      htmlElement = htmlDoc.createElement("span");
      const styleName = fb2Element.getAttribute("name");
      if (styleName) {
        const className = `style-${styleName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()}`;
        htmlElement.classList.add(className);
      } else {
        htmlElement.classList.add("style-generic");
      }
      break;
    }
    case "a": {
      const isNoteLink = fb2Element.getAttribute("type") === "note";

      if (isNoteLink) {
        htmlElement = htmlDoc.createElement("Note");
        const href = fb2Element.getAttributeNS(XLINK_NAMESPACE, "href") || fb2Element.getAttribute("href");
        if (href) {
          const id: string = extractNumberStringFromFnHref(href as string);
          htmlElement.setAttribute("id", id);
        }
      } else {
        // Regular link - preserve as <a> element
        htmlElement = htmlDoc.createElement("a");
        const href = fb2Element.getAttributeNS(XLINK_NAMESPACE, "href") || fb2Element.getAttribute("href");
        if (href) {
          htmlElement.setAttribute("href", href);
        }
        // Copy any other attributes that might be important for links
        const title = fb2Element.getAttribute("title");
        if (title) htmlElement.setAttribute("title", title);
      }
      break;
    }
    case "section":
      htmlElement = htmlDoc.createElement("section");
      break;
    case "image": {
      htmlElement = htmlDoc.createElement("img");
      const imgHref = fb2Element.getAttributeNS(XLINK_NAMESPACE, "href");
      const imgAlt = fb2Element.getAttribute("alt");
      const imgTitle = fb2Element.getAttribute("title");

      if (imgHref) {
        const imageId = imgHref.startsWith("#") ? imgHref.substring(1) : imgHref;
        const binary = binaryData[imageId];
        if (binary) {
          htmlElement.setAttribute("src", `data:${binary.contentType};base64,${binary.base64Data}`);
        } else {
          htmlElement.setAttribute("src", "#");
          htmlElement.setAttribute("data-missing-id", imageId);
          console.warn(`Binary data not found for image ID: ${imageId}`);
        }
      } else {
        console.warn(`Image tag found without xlink:href: ${fb2Element.outerHTML}`);
        htmlElement.setAttribute("src", "#");
      }
      htmlElement.setAttribute("alt", imgAlt || "");
      if (imgTitle) htmlElement.setAttribute("title", imgTitle);
      break;
    }
    case "table": {
      htmlElement = htmlDoc.createElement("table");
      const tableStyle = fb2Element.getAttribute("style");
      if (tableStyle) htmlElement.setAttribute("style", tableStyle);
      break;
    }
    case "tr":
      htmlElement = htmlDoc.createElement("tr");
      break;
    case "td":
    case "th": {
      htmlElement = htmlDoc.createElement(tagName);
      const colspan = fb2Element.getAttribute("colspan");
      const rowspan = fb2Element.getAttribute("rowspan");
      const align = fb2Element.getAttribute("align");
      const valign = fb2Element.getAttribute("valign");

      if (colspan) htmlElement.setAttribute("colspan", colspan);
      if (rowspan) htmlElement.setAttribute("rowspan", rowspan);
      if (align) htmlElement.classList.add(`align-${align}`);
      if (valign) htmlElement.classList.add(`valign-${valign}`);
      break;
    }
    case "description":
    case "binary":
    case "stylesheet":
    case "annotation":
      return null;
    case "body":
      htmlElement = htmlDoc.createDocumentFragment();
      break;

    default:
      console.warn(`Unhandled FB2 tag: ${tagName}. Treating as span.`);
      htmlElement = htmlDoc.createElement("span");
      htmlElement.classList.add(`fb2-${tagName}`);
      break;
  }

  const fb2Id = fb2Element.getAttribute("id");
  if (fb2Id && htmlElement instanceof htmlDoc.defaultView!.HTMLElement) {
    (htmlElement as HTMLElement).setAttribute("id", fb2Id);
  }

  // Return the created element/fragment. Child processing is handled by the caller.
  return htmlElement;
}

/**
 * Converts the parsed FB2 document into rich HTML5, including chapter/index markers.
 * @param doc - The parsed FB2 Document.
 * @param startChapterNumber - The number to start chapter counting from.
 * @param startNoteId - The number to start note ID counting from.
 * @returns A string containing the HTML5 output.
 */
function convertToTextHtml(
  doc: Document,
  startChapterNumber: number = 0,
  startNoteId: number = 0,
): { htmlDom: string; lastChapter: number; lastNoteId: number } {
  const binaryData = extractBinaryData(doc);
  let chapterSectionsSet = identifyChapterSections(doc); // Get the set of chapter elements

  if (chapterSectionsSet.size === 0) {
    chapterSectionsSet = identifyChapterInABookWithNoChapters(doc);
  }

  const htmlDom = new JSDOM(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title></title></head><body></body></html>',
  );

  const htmlDoc = htmlDom.window.document;
  const htmlBody = htmlDoc.body;

  // --- Populate Head ---
  const head = htmlDoc.head;
  const titleInfo = doc.querySelector("description > title-info");
  const bookTitle = titleInfo?.querySelector("book-title")?.textContent;
  const authorFirstName = titleInfo?.querySelector("author > first-name")?.textContent;
  const authorLastName = titleInfo?.querySelector("author > last-name")?.textContent;
  const lang = titleInfo?.querySelector("lang")?.textContent;

  if (lang) {
    htmlDoc.documentElement.setAttribute("lang", lang);
  }
  if (bookTitle) {
    htmlDoc.title = bookTitle;
  }
  if (authorFirstName || authorLastName) {
    const author = [authorFirstName, authorLastName].filter(Boolean).join(" ");
    const metaAuthor = htmlDoc.createElement("meta");
    metaAuthor.setAttribute("name", "author");
    metaAuthor.setAttribute("content", author);
    head.appendChild(metaAuthor);
  }
  // Add more meta tags (genre, keywords, etc.) if needed from description

  let chapterCounter = startChapterNumber; // Initialize chapter counter with the offset

  /**
   * Recursively processes an FB2 node, transforms it, adds chapter/index attributes,
   * appends it to the parent, and processes its children.
   * @param fb2Node The current FB2 node to process.
   * @param htmlParent The HTML node to append the transformed result to.
   * @param currentHeadingLevel Current H level for section titles.
   * @param isParentChapter Indicates if the *parent* node was a chapter start.
   */
  // Inside convertToTextHtml function:
  function processNodeRecursive(
    fb2Node: Node,
    htmlParent: Node,
    currentHeadingLevel: number,
    isParentChapter: boolean = false,
  ) {
    // 1. Transform the current node itself
    const transformedHtmlNode = transformSingleNodeToHtml(fb2Node, htmlDoc, binaryData, currentHeadingLevel);

    if (!transformedHtmlNode) return; // Skip node

    let nextHeadingLevel = currentHeadingLevel;
    let isCurrentNodeChapterStart = false;
    let currentHtmlElement: Element | null = null;
    // --- MODIFICATION START: Flag to skip child processing ---
    let skipChildProcessing = false;
    // --- MODIFICATION END ---

    if (transformedHtmlNode.nodeType === transformedHtmlNode.ELEMENT_NODE) {
      currentHtmlElement = transformedHtmlNode as Element;
    }

    // 2. Handle chapter start and data-chapter attribute
    if (fb2Node.nodeType === fb2Node.ELEMENT_NODE) {
      const fb2Element = fb2Node as Element;
      const fb2Tag = fb2Element.tagName.toLowerCase();

      isCurrentNodeChapterStart = chapterSectionsSet.has(fb2Element);
      if (isCurrentNodeChapterStart && currentHtmlElement) {
        currentHtmlElement.setAttribute("data-chapter", chapterCounter.toString());
        chapterCounter++;
        nextHeadingLevel++;
      } else if (fb2Tag === "section") {
        nextHeadingLevel++;
      }

      // --- MODIFICATION START: Check if title was handled ---
      // If the original node was a title and we created an Hx or P.inline-title for it,
      // its content is already set, so skip processing its children (like the inner <p>).
      if (
        fb2Tag === "title" &&
        currentHtmlElement &&
        (currentHtmlElement.tagName.toLowerCase().startsWith("h") ||
          currentHtmlElement.classList.contains("inline-title"))
      ) {
        skipChildProcessing = true;
      }
      // --- MODIFICATION END ---
    }

    // 3. Append the transformed node to the HTML parent
    htmlParent.appendChild(transformedHtmlNode);

    // 4. Recursively process children ONLY IF needed
    // --- MODIFICATION START: Added !skipChildProcessing ---
    if (!skipChildProcessing && fb2Node.nodeType === fb2Node.ELEMENT_NODE) {
      // --- MODIFICATION END ---
      const fb2Element = fb2Node as Element;
      const parentForChildren = currentHtmlElement || htmlParent;

      fb2Element.childNodes.forEach((fb2ChildNode) => {
        processNodeRecursive(
          fb2ChildNode,
          parentForChildren,
          nextHeadingLevel,
          isCurrentNodeChapterStart, // Children inherit chapter status
        );
      });
    }
  } // End of processNodeRecursive

  // --- Start Processing ---
  const fb2Body = doc.querySelector("body");
  if (fb2Body) {
    let initialHeadingLevel = 1; // Assume H1 for body title if present
    const bodyTitle = fb2Body.querySelector(":scope > title");
    // If no direct title in body, start chapter titles at H2 potentially
    if (!bodyTitle) initialHeadingLevel = 2;

    // Process children of the FB2 body using the recursive function
    fb2Body.childNodes.forEach((node) => {
      // Initial call: parent is htmlBody, not inside a chapter yet.
      processNodeRecursive(node, htmlBody, initialHeadingLevel, false);
    });
  } else {
    htmlBody.textContent = "Error: No <body> element found in FB2 source.";
  }

  // Modify all Note ID attributes by adding the offset
  const noteElements = htmlDoc.querySelectorAll("Note[id]");
  if (startNoteId > 0) {
    noteElements.forEach((noteEl) => {
      const currentId = noteEl.getAttribute("id");
      if (currentId && !isNaN(Number(currentId))) {
        const newId = (parseInt(currentId) + startNoteId - 1).toString();
        noteEl.setAttribute("id", newId);
      }
    });
  }

  // Serialize the final HTML document
  return { htmlDom: htmlDom.serialize(), lastChapter: chapterCounter - 1, lastNoteId: noteElements.length };
}

// --- Main Converter Function ---

/**
 * Converts an FB2 XML string to both simple XML and rich HTML5 formats.
 * @param fb2XmlString - The FB2 XML content as a string.
 * @param options - Optional configuration for the conversion.
 * @returns An object containing the simpleXml and richHtml strings.
 * @throws Error if parsing fails.
 */
export function convertFb2(fb2XmlString: string, options: Fb2ConversionOptions = {}): ConversionResult {
  // Add a try-catch block around the whole process for robustness
  try {
    const doc = parseFb2Xml(fb2XmlString);
    const { startFromChapter, startFromNoteId } = options;

    const chaptersXml = convertToChaptersXml(doc, startFromChapter);
    const textHtml = convertToTextHtml(doc, startFromChapter, startFromNoteId);

    return {
      chaptersXml,
      textHtml: textHtml.htmlDom,
      lastChapter: textHtml.lastChapter,
      lastNoteId: textHtml.lastNoteId,
    };
  } catch (error) {
    console.error("FB2 Conversion failed:", error);
    // Re-throw or return an error state depending on desired behavior
    throw error;
  }
}
