import { DOMParser, XMLSerializer, Node, Element as XMLElement } from "@xmldom/xmldom";
import fs from "fs";
import path from "path";

import { getTalkingMediaFilePathForName, getListeningMediaFilePathForName } from "@/utils/getFilePathsForName";
import { BOOK_SLUGS, CURRENT_BOOK } from "@/consts";

// Helper function to extract file data from XML elements
const extractFileData = (
  chapter: XMLElement,
  tagName: string,
  chapterNumber: number,
): Array<{ chapter: number; paragraph: number; files: Array<{ title: string; delayInMs?: number; text?: string }> }> => {
  const elementsArray = chapter.getElementsByTagName(tagName);
  const filesByParagraph: Record<number, Array<{ title: string; delayInMs?: number; text?: string }>> = {};

  for (let i = 0; i < elementsArray.length; i++) {
    const files = elementsArray[i].getElementsByTagName("File");

    for (let j = 0; j < files.length; j++) {
      const fileElement = files[j];
      const title = fileElement.getAttribute("title");
      const paragraph = fileElement.getAttribute("paragraph");
      const delayInMs = fileElement.getAttribute("delayInMs");
      const text = fileElement.getAttribute("text");

      if (title && paragraph !== null) {
        const paragraphNum = parseInt(paragraph, 10);
        if (!filesByParagraph[paragraphNum]) {
          filesByParagraph[paragraphNum] = [];
        }

        const fileData: { title: string; delayInMs?: number; text?: string } = { title };
        if (delayInMs !== null) {
          fileData.delayInMs = parseInt(delayInMs, 10);
        }
        if (text !== null) {
          fileData.text = text;
        }

        filesByParagraph[paragraphNum].push(fileData);
      }
    }
  }

  return Object.entries(filesByParagraph).map(([paragraph, files]) => ({ chapter: chapterNumber, paragraph: parseInt(paragraph, 10), files: files }));
};

export const xmlToComplexHtml = (
  xmlString: string,
  bookSlug: string,
): {
  htmlResult: string;
  backgroundsData: Array<{ chapter: number; file: string; startParagraph: number }>;
  audioData: Array<{ chapter: number; paragraph: number; files: string[] }>;
  cutSceneData: Array<{ chapter: number; paragraph: number; files: Array<{ title: string; delayInMs?: number; text?: string }> }>;
} => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const serializer = new XMLSerializer();
  let htmlResult = "";

  // Arrays to collect background, audio, and cutscene data
  const backgroundsData: Array<{ chapter: number; file: string; startParagraph: number }> = [];
  const audioData: Array<{ chapter: number; paragraph: number; files: string[] }> = [];
  const cutSceneData: Array<{ chapter: number; paragraph: number; files: Array<{ title: string; delayInMs?: number; text?: string }> }> = [];

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
    const chapterNumber = parseInt(chapterId || "0", 10);

    const backgroundFileData = extractFileData(chapter, "BackgroundFiles", chapterNumber);
    backgroundFileData.forEach((item) => {
      item.files.forEach((file) => {
        backgroundsData.push({ chapter: chapterNumber, file: file.title, startParagraph: item.paragraph });
      });
    });

    const audioFileData = extractFileData(chapter, "AudioFiles", chapterNumber);
    audioFileData.forEach((item) => {
      audioData.push({ chapter: chapterNumber, paragraph: item.paragraph, files: item.files.map((f) => f.title) });
    });

    const cutSceneFileData = extractFileData(chapter, "CutSceneFiles", chapterNumber);
    cutSceneData.push(...cutSceneFileData);

    htmlResult += `\n      <section><section data-chapter="${chapterId}">`;
    let dataIndex = 0;

    // Iterate over direct child nodes of the chapter
    for (let j = 0; j < chapter.childNodes.length; j++) {
      const node = chapter.childNodes[j];

      // Check if it's an element node
      if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
        const childElement = node as unknown as Element;
        const tagName = childElement.tagName;

        // Skip these tags as they are handled separately in extractFileData
        if (tagName === "BackgroundFiles" || tagName === "AudioFiles" || tagName === "CutSceneFiles") {
          continue;
        }

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
                const characterSlug = pElement.tagName;
                const isTalking = pElement.getAttribute("talking") === "true";
                const talkingSrc = getTalkingMediaFilePathForName(characterSlug, bookSlug);
                const listeningSrc = getListeningMediaFilePathForName(characterSlug, bookSlug);

                if (isTalking) {
                  // Generate placeholder span for talking character
                  pContent += `<span class="character-placeholder character-talking" data-character="${characterSlug}" data-src-talking="${talkingSrc}" data-is-talking="true"></span>`;
                } else {
                  // Generate placeholder span for mentioned character, preserving text content
                  pContent += `<span class="character-highlighted" data-character="${characterSlug}" data-src-listening="${listeningSrc}" >${pElement.textContent || ""}</span>`;
                }
              } else {
                switch (pElement.tagName) {
                  case "note":
                    // previously it looked like this: <a href="#fn14" class="link-note">[14]</a>
                    pContent += `<a href="#fn${pElement.getAttribute("id")}" class="link-note">${pElement.textContent || ""}</a>`;

                    break;
                  case "b":
                    pContent += `<span class="bold">${pElement.textContent || ""}</span>`;
                    break;
                  case "i":
                    pContent += `<span class="italic">${pElement.textContent || ""}</span>`;
                    break;
                  case "strong":
                    pContent += `<strong>${pElement.textContent.trim() || ""}</strong>`;
                    break;
                  default:
                    pContent += `<${pElement.tagName}>${pElement.textContent || ""}</${pElement.tagName}>`;
                    break;
                }
              }
            } else {
              console.log("unknown tag again", tagName);
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
        } else {
          // Serialize child nodes to preserve inner HTML
          let innerHtml = "";
          for (let k = 0; k < childElement.childNodes.length; k++) {
            // Cast ChildNode to unknown, then to the imported Node type
            const node = childElement.childNodes[k] as unknown as Node;
            // Skip nodes that start with capital letter (XML tags for Characters)
            if (
              node.nodeType === 1 /* Element node */ &&
              node.nodeName &&
              node.nodeName.charAt(0) === node.nodeName.charAt(0).toUpperCase() &&
              node.nodeName.charAt(0) !== node.nodeName.charAt(0).toLowerCase()
            ) {
              console.log("⏭️ skipping tag", node.nodeName);
              continue;
            }
            // console.log("adding tag", node.nodeName);
            innerHtml += serializer.serializeToString(node);
          }
          htmlResult += `\n    <${tagName} data-index="${dataIndex++}">${innerHtml}</${tagName}>`;
        }
        // Add handlers for other potential top-level tags (h1, h2, h3, h6, etc.) if needed
      }
    }

    htmlResult += "\n  </section></section>";
  }

  // Add a wrapping div or return directly depending on final requirements
  // For now, returning the content of the sections directly, trimmed.

  // Return both the HTML result and the extracted data
  return { htmlResult: htmlResult.trim(), backgroundsData, audioData, cutSceneData };
};

// Helper function to generate background, audio, and cutscene files
export const generateDataFiles = (
  backgroundsData: Array<{ chapter: number; file: string; startParagraph: number }>,
  audioData: Array<{ chapter: number; paragraph: number; files: string[] }>,
  cutSceneData: Array<{ chapter: number; paragraph: number; files: Array<{ title: string; delayInMs?: number; text?: string }> }>,
  bookSlug: string,
) => {
  // Generate getBackgroundsForBook.ts
  const backgroundsContent = `import type { BackgroundForBook } from "@/types/book";

export const getBackgroundsForBook = (): BackgroundForBook[] => [
${backgroundsData.map((item) => `  { chapter: ${item.chapter}, paragraph: ${item.startParagraph}, file: "${item.file}" }`).join(",\n")}
];`;
  const backgroundsPath = path.join(__dirname, "..", "..", "src/books", bookSlug, "getBackgroundsForBook.ts");
  fs.writeFileSync(backgroundsPath, backgroundsContent);

  // Generate getBackgroundSongsForBook.ts
  const audioContent = `import type { BackgroundSongForBook } from "@/types/book";

export const getBackgroundSongsForBook = (): BackgroundSongForBook[] => [
${audioData.map((item) => `  { chapter: ${item.chapter}, paragraph: ${item.paragraph}, files: [${item.files.map((f) => `"${f}"`).join(", ")}] }`).join(",\n")}
];`;
  const audioPath = path.join(__dirname, "..", "..", "src/books", bookSlug, "getBackgroundSongsForBook.ts");
  fs.writeFileSync(audioPath, audioContent);

  // Generate getCutScenesForBook.ts
  const cutSceneContent = `import type { CutSceneForBook } from "@/types/book";

export const getCutScenesForBook = (): CutSceneForBook[] => [
${cutSceneData
  .map((item) =>
    item.files
      .map(
        (f) =>
          `  { chapter: ${item.chapter}, paragraph: ${item.paragraph}, file: "${f.title}"${f.delayInMs !== undefined ? `, delayInMs: ${f.delayInMs}` : ""}${f.text !== undefined ? `, text: "${f.text}"` : ""} }`,
      )
      .join(",\n"),
  )
  .filter(Boolean)
  .join(",\n")}
];`;
  const cutScenePath = path.join(__dirname, "..", "..", "src/books", bookSlug, "getCutScenesForBook.ts");
  fs.writeFileSync(cutScenePath, cutSceneContent);
};

// ToDo: Verify if this script is needed?
if (require.main === module) {
  const bookSlug: BOOK_SLUGS = CURRENT_BOOK;

  // Try to read from the public_books directory first (with Background/Audio data)
  let xmlString: string;
  const publicBookPath = path.join(__dirname, "..", "..", "public_books", bookSlug, "book.xml");
  const fallbackPath = path.join(__dirname, `${bookSlug}-chapters.xml`);

  if (fs.existsSync(publicBookPath)) {
    console.log(`Reading from ${publicBookPath}`);
    xmlString = fs.readFileSync(publicBookPath, "utf8");
  } else {
    console.log(`Reading from ${fallbackPath}`);
    xmlString = fs.readFileSync(fallbackPath, "utf8");
  }

  // Example usage: Provide the book slug when calling
  console.log("bookSlug", bookSlug);
  const { backgroundsData, audioData, cutSceneData, htmlResult } = xmlToComplexHtml(xmlString, bookSlug);

  generateDataFiles(backgroundsData, audioData, cutSceneData, bookSlug);

  // Generate the HTML file as before
  if (bookSlug === "1984" || bookSlug === "1984-English") {
    fs.writeFileSync(path.join(__dirname, `chapters-${bookSlug}.ts`), `export const _${bookSlug.replace(/-/g, "")}BookXml = \`<section>${htmlResult}</section>\`;`);
  } else {
    fs.writeFileSync(path.join(__dirname, `chapters-${bookSlug}.ts`), `export const ${bookSlug.replace(/-/g, "")}BookXml = \`<section>${htmlResult}</section>\`;`);
  }
}
