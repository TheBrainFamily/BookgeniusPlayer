import { DOMParser } from "@xmldom/xmldom";
import fs from "fs";
import path from "path";
import { getMovingPictureFilePathForName, getPictureFilePathForName } from "../utils/getFilePathsForName";
import { BOOK_SLUGS } from "../types/book-slugs";

export const xmlToComplexHtml = (xmlString: string): string => {
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

  let paragraphCount = 0;
  for (const chapter of chapters) {
    const chapterId = chapter.getAttribute("id");
    htmlResult += `\n      <section><section data-chapter="${chapterId}">`;
    let dataIndex = 0;

    const bookTitle = chapter.getElementsByTagName("BookTitle")[0];
    if (bookTitle) {
      htmlResult += `\n    <h5 data-index="${dataIndex++}" class="book-title">${bookTitle.textContent || ""}</h5>`;
    }

    const paragraphs = chapter.getElementsByTagName("p");
    for (const p of paragraphs) {
      let pContent = ""; // Build content for the paragraph, including spans
      for (let i = 0; i < p.childNodes.length; i++) {
        const node = p.childNodes[i];
        // Check if the node is a text node (nodeType 3) and append its content
        if (node.nodeType === 3 /* Node.TEXT_NODE */) {
          pContent += node.textContent;
        }
        // If it's an element node (nodeType 1)
        else if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
          const element = node as unknown as Element;
          const characterInfo = characterMap.get(element.tagName);

          if (characterInfo) {
            paragraphCount++;
            if (paragraphCount <= 10) {
              const isTalking = element.getAttribute("talking") === "true";
              if (isTalking) {
                pContent += `<span class="character-talking"><video class="inline-avatar" data-character="${characterInfo.display}" src="${getMovingPictureFilePathForName(characterInfo.display, "Pharaon" as BOOK_SLUGS)}" autoPlay loop muted playsInline></video></span>`;
              } else {
                pContent += `<span class="character-mention"><video class="inline-avatar" data-character="${characterInfo.display}" src="${getPictureFilePathForName(characterInfo.display, "Pharaon" as BOOK_SLUGS)}" autoPlay loop muted playsInline></video></span>${element.textContent || ""}`;
              }
            }
          } else {
            // Handle other potential elements if needed, e.g., <b>, <i>
            // For now, we ignore unknown tags within <p>
          }
        }
      }

      // Only add paragraph if it contains non-whitespace content after processing
      // Check the processed content, not just trimmed text
      if (pContent.trim()) {
        // Ensure text nodes adjacent to spans have correct spacing
        // Replace multiple spaces resulting from node concatenation/trimming with single spaces
        // Also trim leading/trailing whitespace for the final paragraph content
        let cleanedContent = pContent.replace(/\s+/g, " ").trim();
        // Fix potential issue where empty spans might leave unwanted spaces by removing spaces around the captured span
        cleanedContent = cleanedContent.replace(/\s*(<span class="character-talking"[^>]*><\/span>)\s*/g, "$1");
        htmlResult += `\n    <p data-index="${dataIndex++}">\n      ${cleanedContent}\n    </p>`;
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
  const htmlString = xmlToComplexHtml(xmlString);
  fs.writeFileSync(path.join(__dirname, "chapters.ts"), `export const faraonBookXml = \`<section>${htmlString}</section>\`;`);
}
