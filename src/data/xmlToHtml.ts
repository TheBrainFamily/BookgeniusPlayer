import { DOMParser } from "@xmldom/xmldom";

export const xmlToHtml = (xmlString: string): string => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  let htmlResult = "";

  const chapters = xmlDoc.getElementsByTagName("Chapter");

  for (const chapter of chapters) {
    const chapterId = chapter.getAttribute("id");
    htmlResult += `\n      <section data-chapter="${chapterId}">`;
    let dataIndex = 0;

    const bookTitle = chapter.getElementsByTagName("BookTitle")[0];
    if (bookTitle) {
      htmlResult += `\n    <h5 data-index="${dataIndex++}" class="book-title">${bookTitle.textContent || ""}</h5>`;
    }

    const paragraphs = chapter.getElementsByTagName("p");
    for (const p of paragraphs) {
      let pText = "";
      for (let i = 0; i < p.childNodes.length; i++) {
        const node = p.childNodes[i];
        // Check if the node is a text node (nodeType 3) and append its content
        if (node.nodeType === 3 /* Node.TEXT_NODE */) {
          pText += node.textContent;
        }
        // If it's an element node (nodeType 1)
        else if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
          const element = node as unknown as Element; // Cast via unknown
          // Check tagName on the typed element
          if (element.tagName !== "charactersMentioned" && element.tagName !== "charactersTalking") {
            // Recursively get text content of allowed child elements if necessary
            // For simplicity now, we are just taking top-level text content.
            // If <p> could contain <b> or <i>, we'd need a recursive function here.
          }
        }
      }
      pText = pText.trim(); // Trim whitespace after accumulating text

      // Only add paragraph if it contains text after cleanup
      if (pText) {
        htmlResult += `\n    <p data-index="${dataIndex++}">\n      ${pText}\n    </p>`;
      }
    }

    htmlResult += "\n  </section>";
  }

  // Add a wrapping div or return directly depending on final requirements
  // For now, returning the content of the sections directly, trimmed.
  return htmlResult.trim();
};
