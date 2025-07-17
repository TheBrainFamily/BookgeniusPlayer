import { DOMParser, XMLSerializer, Node, Element as XMLElement, Element } from "@xmldom/xmldom";
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
  chapterTitles: Array<{ id: string; title: string }>;
} => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const serializer = new XMLSerializer();
  let htmlResult = "";

  const backgroundsData: Array<{ chapter: number; file: string; startParagraph: number }> = [];
  const audioData: Array<{ chapter: number; paragraph: number; files: string[] }> = [];
  const cutSceneData: Array<{ chapter: number; paragraph: number; files: Array<{ title: string; delayInMs?: number; text?: string }> }> = [];
  const chapterTitles: Array<{ id: string; title: string }> = [];

  // Build characterMap (unchanged)
  const charactersMaster = xmlDoc.getElementsByTagName("CharactersMaster")[0];
  const characterMap = new Map<string, { display: string }>();
  if (charactersMaster) {
    for (let i = 0; i < charactersMaster.childNodes.length; i++) {
      const node = charactersMaster.childNodes[i];
      if (node.nodeType === 1) {
        const element = node as Element;
        const tagName = element.tagName;
        const display = element.getAttribute("display") || tagName;
        characterMap.set(tagName, { display });
      }
    }
  }

  const bookForm = xmlDoc.getElementsByTagName("BookForm")[0];
  const bookFormValue = bookForm ? bookForm.textContent : "";
  if (bookFormValue === "Play") {
    htmlResult += `\n    <div class="play-container">`;
  }

  const chapters = xmlDoc.getElementsByTagName("Chapter");

  let currentAct = "";
  let currentCharacterAlignment = "";
  let isCharacter = false;
  let lastSpanId = "";

  for (const chapter of chapters) {
    const chapterId = chapter.getAttribute("id");
    const chapterNumber = parseInt(chapterId || "0", 10);

    let chapterTitle = "";
    const actElements = chapter.getElementsByTagName("Act");
    const h3Elements = chapter.getElementsByTagName("h3");
    const h4Elements = chapter.getElementsByTagName("h4");

    if (h3Elements.length > 0) {
      chapterTitle = h3Elements[0].textContent || "";
    } else if (h4Elements.length > 0) {
      chapterTitle = h4Elements[0].textContent || "";
    }

    if (actElements.length > 0) {
      currentAct = actElements[0].textContent || "";
    }
    if (currentAct) {
      chapterTitle = chapterTitle ? `${currentAct}, ${chapterTitle}` : currentAct;
    }

    chapterTitles.push({ id: chapterId || String(chapterNumber), title: chapterTitle });

    // collect file data (unchanged)
    extractFileData(chapter, "BackgroundFiles", chapterNumber).forEach((item) =>
      item.files.forEach((f) => backgroundsData.push({ chapter: chapterNumber, file: f.title, startParagraph: item.paragraph })),
    );
    extractFileData(chapter, "AudioFiles", chapterNumber).forEach((item) =>
      audioData.push({ chapter: chapterNumber, paragraph: item.paragraph, files: item.files.map((f) => f.title) }),
    );
    cutSceneData.push(...extractFileData(chapter, "CutSceneFiles", chapterNumber));

    htmlResult += `\n      <section><section data-chapter="${chapterId}">`;
    let dataIndex = 0;

    // ─── iterate over chapter children ───
    for (let j = 0; j < chapter.childNodes.length; j++) {
      const node = chapter.childNodes[j];
      if (node.nodeType !== 1) continue;
      const childElement = node as Element;
      const tagName = childElement.tagName;

      if (["BackgroundFiles", "AudioFiles", "CutSceneFiles"].includes(tagName)) {
        continue;
      }

      if (tagName === "p") {
        let pContent = "";
        let hasSignificantTextContent = false;

        for (let k = 0; k < childElement.childNodes.length; k++) {
          const pNode = childElement.childNodes[k];

          // ── 1) TEXT ──
          if (pNode.nodeType === 3) {
            const textContent = pNode.textContent || "";

            if (textContent.trim().length > 0) {
              hasSignificantTextContent = true;
            }

            pContent += textContent;
            continue;
          }

          // ── 2) ELEMENT ──
          if (pNode.nodeType === 1) {
            const pElement = pNode as Element;

            // 2a) sentence-wrapper span
            if (pElement.tagName === "span" && pElement.hasAttribute("id")) {
              const spanId = pElement.getAttribute("id")!;
              let inner = "";

              // recurse into its children
              for (let m = 0; m < pElement.childNodes.length; m++) {
                const sub = pElement.childNodes[m];
                if (sub.nodeType === 3) {
                  const subTextContent = sub.textContent || "";

                  if (subTextContent.trim().length > 0) {
                    hasSignificantTextContent = true;
                  }

                  inner += subTextContent;
                } else if (sub.nodeType === 1) {
                  const e = sub as Element;
                  const char = characterMap.get(e.tagName);
                  if (char) {
                    const slug = e.tagName;
                    const isTalking = e.getAttribute("talking") === "true";
                    const talkingSrc = getTalkingMediaFilePathForName(slug, bookSlug);
                    const listeningSrc = getListeningMediaFilePathForName(slug, bookSlug);
                    if (isTalking) {
                      isCharacter = true;
                      const startOfParagraphClass = !hasSignificantTextContent ? " start-of-paragraph" : "";
                      inner += `<span class="character-placeholder character-talking${startOfParagraphClass}" data-character="${slug}" data-src-talking="${talkingSrc}" data-is-talking="true"></span>`;
                      if (spanId !== lastSpanId) {
                        currentCharacterAlignment = currentCharacterAlignment === "left" ? "right" : "left";
                      }
                      lastSpanId = spanId;
                    } else {
                      if (e.getAttribute("dynasty") === "true") {
                        inner += e.textContent;
                      } else {
                        inner += `<span class="character-highlighted" data-character="${slug}" data-src-listening="${listeningSrc}">${e.textContent}</span>`;
                      }
                    }
                  } else {
                    // your existing note / b / i / strong / default logic:
                    switch (e.tagName) {
                      case "note":
                        inner += `<a href="#fn${e.getAttribute("id")}" class="link-note">${e.textContent}</a>`;
                        break;
                      case "b":
                        inner += `<span class="bold">${e.textContent}</span>`;
                        break;
                      case "i":
                        inner += `<span class="italic">${e.textContent}</span>`;
                        break;
                      case "strong":
                        inner += `<strong>${e.textContent.trim()}</strong>`;
                        break;
                      default: {
                        const eid = e.getAttribute("id");
                        const idStr = eid ? ` id="${eid}"` : "";
                        inner += `<${e.tagName}${idStr}>${e.textContent}</${e.tagName}>`;
                      }
                    }
                  }
                }
              }

              pContent += `<span id="${spanId}">${inner}</span>`;
              continue;
            }
            // 2b) character‐tag (e.g. <Alice>)
            const ci = characterMap.get(pElement.tagName);
            if (ci) {
              const slug = pElement.tagName;
              const isTalking = pElement.getAttribute("talking") === "true";
              const talkingSrc = getTalkingMediaFilePathForName(slug, bookSlug);
              const listeningSrc = getListeningMediaFilePathForName(slug, bookSlug);
              if (isTalking) {
                const startOfParagraphClass = !hasSignificantTextContent ? " start-of-paragraph" : "";
                pContent += `<span class="character-placeholder character-talking${startOfParagraphClass}" data-character="${slug}" data-src-talking="${talkingSrc}" data-is-talking="true"></span>`;
              } else {
                if (pElement.getAttribute("dynasty") === "true") {
                  pContent += pElement.textContent;
                } else {
                  pContent += `<span class="character-highlighted" data-character="${slug}" data-src-listening="${listeningSrc}">${pElement.textContent}</span>`;
                }
              }
            }
            // 2c) notes / formatting / default
            else {
              hasSignificantTextContent = true;
              switch (pElement.tagName) {
                case "note":
                  pContent += `<a href="#fn${pElement.getAttribute("id")}" class="link-note">${pElement.textContent}</a>`;
                  break;
                case "b":
                  pContent += `<span class="bold">${pElement.textContent}</span>`;
                  break;
                case "i":
                  pContent += `<span class="italic">${pElement.textContent}</span>`;
                  break;
                case "strong":
                  pContent += `<strong>${pElement.textContent.trim()}</strong>`;
                  break;
                default: {
                  const eid2 = pElement.getAttribute("id");
                  const idStr2 = eid2 ? ` id="${eid2}"` : "";
                  pContent += `<${pElement.tagName}${idStr2}>${pElement.textContent || ""}</${pElement.tagName}>`;
                }
              }
            }
          }
        }

        // collapse whitespace & emit
        if (pContent.trim()) {
          let clean = pContent.replace(/\s+/g, " ").trim();
          clean = clean.replace(/\s*(<span class="character-talking"[^>]*><\/span>)\s*/g, "$1");

          if (bookFormValue === "Play") {
            if (isCharacter && currentCharacterAlignment === "left") {
              htmlResult += `\n </span>\n`;
            }

            htmlResult += `\n    <p 
                data-index="${dataIndex++}" 
                data-text-alignment="${currentCharacterAlignment}" 
                data-is-character="${isCharacter}"
                data-is-didaskalia="${pContent.includes("<em>")}"
                >\n      ${clean}\n    </p>`;

            if (isCharacter && currentCharacterAlignment === "right") {
              htmlResult += `\n <span class="right-character-container">\n`;
            }
            if (isCharacter) {
              isCharacter = false;
            }
          } else {
            htmlResult += `\n <p data-index="${dataIndex++}">\n ${clean}\n </p>`;
          }
        }
      } else if (tagName === "Act") {
        htmlResult += `\n    <h3 data-act="true">${childElement.textContent || ""}</h3>`;
      } else if (tagName === "h4") {
        htmlResult += `\n    <h4 data-index="${dataIndex++}">${childElement.textContent}</h4>`;
      } else if (tagName === "h5") {
        htmlResult += `\n    <h5 data-index="${dataIndex++}">${childElement.textContent}</h5>`;
      } else {
        // serialize any other tags
        let inner = "";
        for (let k = 0; k < childElement.childNodes.length; k++) {
          const n2 = childElement.childNodes[k] as unknown as Node;
          if (n2.nodeType === 1 && n2.nodeName.charAt(0).toUpperCase() === n2.nodeName.charAt(0)) {
            continue;
          }
          inner += serializer.serializeToString(n2);
        }
        htmlResult += `\n    <${tagName} data-index="${dataIndex++}">${inner}</${tagName}>`;
      }
    }

    htmlResult += "\n  </section></section>";
  }

  if (bookFormValue === "Play") {
    htmlResult += `\n    </div>`;
  }

  return { htmlResult: htmlResult.trim(), backgroundsData, audioData, cutSceneData, chapterTitles };
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
