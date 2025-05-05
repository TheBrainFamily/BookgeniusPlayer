import { DOMParser } from "@xmldom/xmldom";
import fs from "fs";
import path from "path";
import { getMovingPictureFilePathForName, getPictureFilePathForName } from "../utils/getFilePathsForName";
import { BOOK_SLUGS } from "../consts";

export const xmlToComplexHtml = (xmlString: string, bookSlug: BOOK_SLUGS): string => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  let htmlResult = "";

  // Parse CharactersMaster
  const charactersMaster = xmlDoc.getElementsByTagName("CharactersMaster")[0];
  const characterMap = new Map<string, { display: string }>();
  if (charactersMaster) {
    for (let i = 0; i < charactersMaster.childNodes.length; i++) {
      const node = charactersMaster.childNodes[i];
      if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
        const element = node as unknown as Element;
        const tagName = element.tagName;
        const display = element.getAttribute("display") || tagName; // Use tagName as fallback
        characterMap.set(tagName, { display });
      }
    }
  }

  const chapters = xmlDoc.getElementsByTagName("Chapter");

  for (const chapter of chapters) {
    const chapterId = chapter.getAttribute("id");
    htmlResult += `\n      <section><section data-chapter="${chapterId}">`;
    let dataIndex = 0;

    // Iterate over direct child nodes of the chapter
    for (let j = 0; j < chapter.childNodes.length; j++) {
      const node = chapter.childNodes[j];

      // Check if it's an element node
      if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
        const childElement = node as unknown as Element;
        const tagName = childElement.tagName;

        if (tagName === "p") {
          // Process paragraph element
          let pContent = "";
          for (let k = 0; k < childElement.childNodes.length; k++) {
            const pNode = childElement.childNodes[k];
            // Check if the node is a text node (nodeType 3) and append its content
            if (pNode.nodeType === 3 /* Node.TEXT_NODE */) {
              pContent += pNode.textContent;
            }
            // If it's an element node (nodeType 1)
            else if (pNode.nodeType === 1 /* Node.ELEMENT_NODE */) {
              const pElement = pNode as unknown as Element;
              const characterInfo = characterMap.get(pElement.tagName);

              if (characterInfo) {
                const isTalking = pElement.getAttribute("talking") === "true";
                const movingSrc = getMovingPictureFilePathForName(characterInfo.display, bookSlug);
                const pictureSrc = getPictureFilePathForName(characterInfo.display, bookSlug);

                if (isTalking) {
                  // Generate placeholder span for talking character
                  pContent += `<span class="character-placeholder character-talking" data-character="${characterInfo.display}" data-src-moving="${movingSrc}" data-is-talking="true"></span>`;
                } else {
                  // Generate placeholder span for mentioned character, preserving text content
                  pContent += `${pElement.textContent || ""}<span class="character-placeholder character-mention" data-character="${characterInfo.display}" data-src-picture="${pictureSrc}" data-is-talking="false"></span>`;
                }
              } else {
                // Handle other potential elements if needed, e.g., <b>, <i>
                // For now, we ignore unknown tags within <p>
              }
            }
          }

          // Only add paragraph if it contains non-whitespace content after processing
          if (pContent.trim()) {
            let cleanedContent = pContent.replace(/\s+/g, " ").trim();
            cleanedContent = cleanedContent.replace(/\s*(<span class="character-talking"[^>]*><\/span>)\s*/g, "$1");
            htmlResult += `\n    <p data-index="${dataIndex++}">\n      ${cleanedContent}\n    </p>`;
          }
        } else if (tagName === "h4") {
          // Handle h4 element (e.g., chapter title)
          htmlResult += `\n    <h4 data-index="${dataIndex++}">${childElement.textContent || ""}</h4>`;
        } else if (tagName === "h5") {
          // Handle h5 element (e.g., book title)
          htmlResult += `\n    <h5 data-index="${dataIndex++}">${childElement.textContent || ""}</h5>`;
        }
        // Add handlers for other potential top-level tags (h1, h2, h3, h6, etc.) if needed
      }
    }

    htmlResult += "\n  </section></section>";
  }

  // Add a wrapping div or return directly depending on final requirements
  // For now, returning the content of the sections directly, trimmed.
  return htmlResult.trim();
};

if (require.main === module) {
  const xmlString = fs.readFileSync(path.join(__dirname, "chapters.xml"), "utf8");
  // Example usage: Provide the book slug when calling
  const htmlString = xmlToComplexHtml(xmlString, "Pharaon" as BOOK_SLUGS);
  fs.writeFileSync(path.join(__dirname, "chapters.ts"), `export const faraonBookXml = \`<section>${htmlString}</section>\`;`);
}
