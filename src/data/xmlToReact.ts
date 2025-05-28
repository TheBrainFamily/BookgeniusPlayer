// Converter: xmlToReactChapters.ts
import { DOMParser, XMLSerializer, Node, Element } from "@xmldom/xmldom";
import fs from "fs";
import path from "path";
import { getTalkingMediaFilePathForName, getListeningMediaFilePathForName } from "@/utils/getFilePathsForName";
import { BOOK_SLUGS, CURRENT_BOOK } from "@/consts";

interface CharacterInfo {
  display: string;
  summary?: string;
}

export const xmlToReactChapters = (xmlString: string, bookSlug: BOOK_SLUGS): void => {
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
    const titleElements = chapter.getElementsByTagName("h3");
    if (titleElements.length > 0) {
      chapterTitle = titleElements[0].textContent || "";
    }

    chapterMetadata.push({ id: chapterId, title: chapterTitle });

    const componentCode = generateChapterComponent(chapter, chapterId, characterMap, bookSlug);

    fs.writeFileSync(path.join(outputDir, `Chapter${chapterId}.tsx`), componentCode);
  }

  // Generate index file
  generateIndexFile(bookSlug, chapterMetadata, characterMap);

  // Generate types file
  generateTypesFile(bookSlug);
};

function generateChapterComponent(chapter: Element, chapterId: string, characterMap: Map<string, CharacterInfo>, bookSlug: BOOK_SLUGS): string {
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

      if (tagName === "p") {
        const paragraphJSX = processParagraph(childElement, dataIndex++, characterMap, bookSlug, indent);
        componentCode += paragraphJSX;
      } else if (tagName === "h3" || tagName === "h4" || tagName === "h5") {
        const content = escapeJSX(childElement.textContent || "");
        componentCode += `${indent}<${tagName} data-index="${dataIndex++}">${content}</${tagName}>\n`;
      } else if (tagName === "h1" || tagName === "h2" || tagName === "h6") {
        const content = escapeJSX(childElement.textContent || "");
        componentCode += `${indent}<${tagName} data-index="${dataIndex++}">${content}</${tagName}>\n`;
      }
    }
  }

  componentCode += `    </section>\n`;
  componentCode += `  );\n`;
  componentCode += `};\n\n`;
  componentCode += `export default Chapter${chapterId};\n`;

  return componentCode;
}

function processParagraph(paragraphElement: Element, dataIndex: number, characterMap: Map<string, CharacterInfo>, bookSlug: BOOK_SLUGS, indent: string): string {
  let jsxContent = `${indent}<p data-index="${dataIndex}">\n`;
  const contentParts: string[] = [];

  for (let k = 0; k < paragraphElement.childNodes.length; k++) {
    const pNode = paragraphElement.childNodes[k];

    if (pNode.nodeType === 3 /* Node.TEXT_NODE */) {
      const text = pNode.textContent || "";
      if (text.trim()) {
        contentParts.push(escapeJSX(text));
      }
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

  jsxContent += `${indent}</p>\n`;
  return jsxContent;
}

function processInlineElement(element: Element, characterMap: Map<string, CharacterInfo>, bookSlug: BOOK_SLUGS): string {
  const characterInfo = characterMap.get(element.tagName);

  if (characterInfo) {
    const characterSlug = element.tagName;
    const isTalking = element.getAttribute("talking") === "true";
    const talkingSrc = getTalkingMediaFilePathForName(characterSlug, bookSlug);
    const listeningSrc = getListeningMediaFilePathForName(characterSlug, bookSlug);

    if (isTalking) {
      return `<span \n          className="character-placeholder character-talking" \n          data-character="${characterSlug}" \n          data-src-talking="${talkingSrc}" \n          data-is-talking="true"\n        />`;
    } else {
      const content = escapeJSX(element.textContent || "");
      return `<span \n          className="character-highlighted" \n          data-character="${characterSlug}" \n          data-src-listening="${listeningSrc}"\n        >\n          ${content}\n        </span>`;
    }
  }

  // Handle other inline elements
  switch (element.tagName) {
    case "note":
      const noteId = element.getAttribute("id");
      const noteContent = escapeJSX(element.textContent || "");
      return `<a href="#fn${noteId}" className="link-note">${noteContent}</a>`;

    case "b":
      return `<span className="bold">${escapeJSX(element.textContent || "")}</span>`;

    case "i":
      return `<span className="italic">${escapeJSX(element.textContent || "")}</span>`;

    case "strong":
      return `<strong>${escapeJSX(element.textContent?.trim() || "")}</strong>`;

    default:
      return `<${element.tagName}>${escapeJSX(element.textContent || "")}</${element.tagName}>`;
  }
}

function escapeJSX(text: string): string {
  // Escape characters that could break JSX
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function generateIndexFile(bookSlug: BOOK_SLUGS, chapters: Array<{ id: string; title: string }>, characterMap: Map<string, CharacterInfo>): void {
  let indexContent = `// Auto-generated index file for ${bookSlug}\n\n`;

  // Export chapter metadata
  indexContent += `export const chapterMetadata = [\n`;
  chapters.forEach((chapter) => {
    indexContent += `  { id: "${chapter.id}", title: "${escapeJSX(chapter.title)}" },\n`;
  });
  indexContent += `];\n\n`;

  // Export character metadata
  indexContent += `export const characterMetadata = new Map([\n`;
  characterMap.forEach((info, slug) => {
    indexContent += `  ["${slug}", { display: "${escapeJSX(info.display)}", summary: "${escapeJSX(info.summary || "")}" }],\n`;
  });
  indexContent += `]);\n\n`;

  // Export dynamic chapter imports
  indexContent += `export const chapterComponents = {\n`;
  chapters.forEach((chapter) => {
    indexContent += `  ${chapter.id}: () => import('./chapters/Chapter${chapter.id}'),\n`;
  });
  indexContent += `};\n\n`;

  indexContent += `export const totalChapters = ${chapters.length};\n`;

  const outputPath = path.join(__dirname, `books/${bookSlug}/index.ts`);
  fs.writeFileSync(outputPath, indexContent);
}

function generateTypesFile(bookSlug: BOOK_SLUGS): void {
  const typesContent = `// Type definitions for ${bookSlug} book\n
export interface ChapterMetadata {
  id: string;
  title: string;
}

export interface CharacterInfo {
  display: string;
  summary?: string;
}

export interface BookMetadata {
  chapters: ChapterMetadata[];
  characters: Map<string, CharacterInfo>;
  totalChapters: number;
}
`;

  const outputPath = path.join(__dirname, `books/${bookSlug}/types.ts`);
  fs.writeFileSync(outputPath, typesContent);
}

// Main execution
if (require.main === module) {
  const bookSlug: BOOK_SLUGS = CURRENT_BOOK;
  const xmlString = fs.readFileSync(path.join(__dirname, `${bookSlug}-chapters.xml`), "utf8");

  console.log(`Converting ${bookSlug} to React components...`);
  xmlToReactChapters(xmlString, bookSlug);
  console.log(`Conversion complete! Check books/${bookSlug}/chapters/ directory.`);
}
