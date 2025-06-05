// Converter: xmlToReactChapters.ts
import { DOMParser, XMLElement } from "@journeyapps/domparser";
import fs, { ftruncateSync } from "fs";
import path from "path";
import { getTalkingMediaFilePathForName, getListeningMediaFilePathForName } from "@/utils/getFilePathsForName";
import { BOOK_SLUGS, CURRENT_BOOK } from "@/consts";
import prettier from "prettier";
import { openSync, writeSync, closeSync } from "fs";

let filePath;
let xmlString;

interface CharacterInfo {
  display: string;
  summary?: string;
}

export const xmlToReactChapters = async (xmlString: string, bookSlug: BOOK_SLUGS): Promise<void> => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  // Parse CharactersMaster
  const charactersMaster = xmlDoc.getElementsByTagName("CharactersMaster")[0];
  const characterMap = new Map<string, CharacterInfo>();

  if (charactersMaster) {
    for (let i = 0; i < charactersMaster.childNodes.length; i++) {
      const node = charactersMaster.childNodes[i];
      if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
        const element = node as unknown as Element;
        const tagName = element.tagName;
        const display = element.getAttribute("display") || tagName;
        const summary = element.getAttribute("summary") || undefined;
        characterMap.set(tagName, { display, summary });
      }
    }
  }

  // Create output directory
  const outputDir = path.join(__dirname, `books/${bookSlug}/chapters`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Process each chapter
  const chapters = xmlDoc.getElementsByTagName("Chapter");

  const chapterMetadata: Array<{ id: string; title: string }> = [];

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const chapterId = chapter.getAttribute("id") || String(i + 1);

    // Find chapter title (first h3, h4, or h5)
    let chapterTitle = "";
    // @ts-expect-error(wrong package types)
    const titleElements = chapter.getElementsByTagName("h3");
    if (titleElements.length > 0) {
      chapterTitle = titleElements[0].textContent || "";
    }

    chapterMetadata.push({ id: chapterId, title: chapterTitle });

    const formattedCode = await prettier.format(generateChapterComponent(chapter, chapterId, characterMap, bookSlug), { parser: "typescript" });

    console.log(formattedCode);
    const outPath = path.join(outputDir, `Chapter${chapterId}.tsx`);
    if (!fs.existsSync(outPath)) {
      fs.writeFileSync(outPath, "", "utf-8");
    }
    const fd = openSync(outPath, "r+");
    writeSync(fd, formattedCode, 0, "utf8");
    ftruncateSync(fd, Buffer.byteLength(formattedCode, "utf8"));
    closeSync(fd);
  }

  // Generate index file
  // generateIndexFile(bookSlug, chapterMetadata, characterMap);

  // Generate types file
  // generateTypesFile(bookSlug);
};

function generateChapterComponent(chapter: XMLElement, chapterId: string, characterMap: Map<string, CharacterInfo>, bookSlug: BOOK_SLUGS): string {
  let componentCode = `import React from 'react';\n\n`;
  componentCode += `export const Chapter${chapterId}: React.FC = () => {\n`;
  componentCode += `  return (\n`;
  componentCode += `    <section data-chapter="${chapterId}">\n`;

  let dataIndex = 0;
  const indent = "      ";

  // Process chapter content
  for (let j = 0; j < chapter.childNodes.length; j++) {
    const node = chapter.childNodes[j];

    if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const childElement = node as unknown as Element;
      const tagName = childElement.tagName;

      const paragraphJSX = processParagraph(childElement, dataIndex++, characterMap, bookSlug, indent, tagName, chapterId);
      componentCode += paragraphJSX;
    }
  }

  componentCode += `    </section>\n`;
  componentCode += `  );\n`;
  componentCode += `};\n\n`;
  componentCode += `export default Chapter${chapterId};\n`;

  return componentCode;
}
let errorCount = 0;

function processParagraph(
  paragraphElement: Element,
  dataIndex: number,
  characterMap: Map<string, CharacterInfo>,
  bookSlug: BOOK_SLUGS,
  indent: string,
  tagName: string,
  chapterId: string,
): string {
  const processInlineElement = (element: Element, characterMap: Map<string, CharacterInfo>, bookSlug: BOOK_SLUGS): string => {
    const characterInfo = characterMap.get(element.tagName);

    if (characterInfo) {
      const characterSlug = element.tagName;
      const isTalking = element.getAttribute("talking") === "true";
      const talkingSrc = getTalkingMediaFilePathForName(characterSlug, bookSlug);
      const listeningSrc = getListeningMediaFilePathForName(characterSlug, bookSlug);

      if (isTalking) {
        return `<span className="character-placeholder character-talking" data-character="${characterSlug}" data-src-talking="${talkingSrc}" data-is-talking="true"/>`;
      } else {
        const content = escapeJSXText(element.textContent || "");
        return `<span className="character-highlighted" data-character="${characterSlug}" data-src-listening="${listeningSrc}">${content}</span>`;
      }
    }

    // Handle other inline elements
    switch (element.tagName) {
      case "note": {
        const noteId = element.getAttribute("id");
        const noteContent = escapeJSXText(element.textContent || "");
        return `<a href="#fn${noteId}" className="link-note">${noteContent}</a>`;
      }
      case "b":
        return `<span className="bold">${escapeJSXText(element.textContent || "")}</span>`;

      case "i":
        return `<span className="italic">${escapeJSXText(element.textContent || "")}</span>`;

      case "strong":
        return `<strong>${escapeJSXText(element.textContent?.trim() || "")}</strong>`;
      case "musicShift":
        return `<span className="absolute top-0 right-5 group" data-editor-mode="true">
                      <span className="cursor-pointer" data-editor-tag="musicShift">♪</span>
                      <span className="hidden group-hover:block absolute right-0 top-6 bg-gray-800 text-white p-2 rounded text-sm whitespace-nowrap">${element.getAttribute("style") || "Music shift"}</span>
                    </span>`;
      case "backgroundShift":
        return `<span className="absolute top-0 right-5 group" data-editor-mode="true">
                      <span className="cursor-pointer" data-editor-tag="backgroundShift">🖼️</span>
                      <span className="hidden group-hover:block absolute right-0 top-6 bg-gray-800 text-white p-2 rounded text-sm whitespace-nowrap">${element.getAttribute("style") || "Background shift"}</span>
                    </span>`;
      default:
        if (element.tagName[0] === element.tagName[0].toUpperCase()) {
          // @ts-expect-error(wrong package types)
          const location = paragraphElement.ownerDocument.locator.position(paragraphElement.openStart);

          errorCount++;
          console.warn(`${filePath}:${location.line + 1} \n Warning: Tag name "${element.tagName}" starts with uppercase letter, this is most probably wrong Character Tag.`);
        }
        return `<${element.tagName}>${escapeJSXText(element.textContent || "")}</${element.tagName}>`;
    }
  };
  // Attempt to get line number information from the element.
  // Note: You may need to install/create type definitions for @journeyapps/domparser.js
  // for proper type checking instead of using 'as any'.

  if (tagName[0] === tagName[0].toUpperCase()) {
    // @ts-expect-error(wrong package types)
    const location = paragraphElement.ownerDocument.locator.position(paragraphElement.openStart);
    errorCount++;
    console.warn(
      `${filePath}:${location.line + 1} \n Warning: Tag name "${tagName}" starts with uppercase letter, that should never be the case, most probably the "talking character" is talking outside of an html element. Chapter ${chapterId}, paragraph ${dataIndex}. `,
    );
  }
  let jsxContent = `${indent}<${tagName} data-index="${dataIndex}" className="relative">`;
  const contentParts: string[] = [];

  for (let k = 0; k < paragraphElement.childNodes.length; k++) {
    const pNode = paragraphElement.childNodes[k];

    if (pNode.nodeType === 3 /* Node.TEXT_NODE */) {
      const text = pNode.textContent || "";
      // Preserve all text, including spaces. escapeJSXText will handle empty strings.
      // React's JSX rendering will typically collapse multiple whitespace characters from text nodes
      // into a single space, and leading/trailing spaces within a line might be trimmed depending on CSS / HTML rules.
      // But we should pass the raw text through.
      contentParts.push(escapeJSXText(text));
    } else if (pNode.nodeType === 1 /* Node.ELEMENT_NODE */) {
      const pElement = pNode as unknown as Element;
      const elementJSX = processInlineElement(pElement, characterMap, bookSlug);
      contentParts.push(elementJSX);
    }
  }

  // Join content parts with proper spacing
  if (contentParts.length > 0) {
    jsxContent += `${indent}  ${contentParts.join("")}\n`;
  }

  jsxContent += `${indent}</${tagName}>\n`;
  return jsxContent;
}

// Old escapeJSX function (lines 160-171) will be replaced by the two functions below.

// Function to escape text for direct inclusion in JSX content
function escapeJSXText(text: string): string {
  if (typeof text !== "string") return "";
  let result = text;
  // Escape HTML special characters to prevent XSS and ensure they are displayed as text.
  // Ampersand must be escaped first.
  result = result.replace(/&/g, "&amp;");
  result = result.replace(/</g, "&lt;");
  result = result.replace(/>/g, "&gt;");

  // To display literal curly braces in JSX text content, they must be escaped.
  // Embedding them as {'{'} and {'}'} is the standard React way.
  // The output of this function is directly concatenated into a template literal
  // that forms the JSX code. So, if text is "{", this function returns "{'{'}",
  // which then becomes part of the JSX code string, e.g., "<span>{'{'}</span>".
  result = result.replace(/{/g, "{'{'}");
  result = result.replace(/}/g, "{'}'}");

  // Characters like ', ", \\n, \\r, \\t, \\ do not need special escaping
  // when they are part of the text content that React will render.
  // React handles them appropriately. For example, newlines are treated as whitespace.
  return result;
}

// Function to escape text for embedding within a JavaScript string literal
// function escapeForJavaScriptStringLiteral(text: string): string {
//   if (typeof text !== "string") return "";
//   return text
//     .replace(/\\/g, "\\\\") // Escape backslashes: \ -> \\
//     .replace(/"/g, '\\"') // Escape double quotes: " -> \\" (for use in ""-delimited strings)
//     .replace(/\n/g, "\\n") // Escape newlines: \n -> \\n (becomes a newline char in the JS string)
//     .replace(/\r/g, "\\r") // Escape carriage returns: \r -> \\r
//     .replace(/\t/g, "\\t"); // Escape tabs: \t -> \\t
// }

// function generateIndexFile(bookSlug: BOOK_SLUGS, chapters: Array<{ id: string; title: string }>, characterMap: Map<string, CharacterInfo>): void {
//   let indexContent = `// Auto-generated index file for ${bookSlug}\n\n`;

//   // Export chapter metadata
//   indexContent += `export const chapterMetadata = [\n`;
//   chapters.forEach((chapter) => {
//     indexContent += `  { id: "${chapter.id}", title: "${escapeForJavaScriptStringLiteral(chapter.title)}" },\n`;
//   });
//   indexContent += `];\n\n`;

//   // Export character metadata
//   indexContent += `export const characterMetadata = new Map([\n`;
//   characterMap.forEach((info, slug) => {
//     indexContent += `  ["${slug}", { display: "${escapeForJavaScriptStringLiteral(info.display)}", summary: "${escapeForJavaScriptStringLiteral(info.summary || "")}" }],\n`;
//   });
//   indexContent += `]);\n\n`;

//   // Export dynamic chapter imports
//   indexContent += `export const chapterComponents = {\n`;
//   chapters.forEach((chapter) => {
//     indexContent += `  ${chapter.id}: () => import('./chapters/Chapter${chapter.id}'),\n`;
//   });
//   indexContent += `};\n\n`;

//   indexContent += `export const totalChapters = ${chapters.length};\n`;

//   const outputPath = path.join(__dirname, `books/${bookSlug}/index.ts`);
//   fs.writeFileSync(outputPath, indexContent);
// }

// function generateTypesFile(bookSlug: BOOK_SLUGS): void {
//   const typesContent = `// Type definitions for ${bookSlug} book\n
// export interface ChapterMetadata {
//   id: string;
//   title: string;
// }

// export interface CharacterInfo {
//   display: string;
//   summary?: string;
// }

// export interface BookMetadata {
//   chapters: ChapterMetadata[];
//   characters: Map<string, CharacterInfo>;
//   totalChapters: number;
// }
// `;

//   const outputPath = path.join(__dirname, `books/${bookSlug}/types.ts`);
//   fs.writeFileSync(outputPath, typesContent);
// }

// Main execution
if (require.main === module) {
  const bookSlug: BOOK_SLUGS = CURRENT_BOOK;
  filePath = path.join(__dirname, `${bookSlug}-chapters.xml`);
  xmlString = fs.readFileSync(filePath, "utf8");

  console.log(`Converting ${bookSlug} to React components...`);
  await xmlToReactChapters(xmlString, bookSlug);
  if (errorCount > 0) {
    console.error(`\n\n!!!!!!! Found ${errorCount} errors. Please fix them before running the project.\n\n`);
  } else {
    console.log(`Conversion complete! Check books/${bookSlug}/chapters/ directory.`);
  }
}
