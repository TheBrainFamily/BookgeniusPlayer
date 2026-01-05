import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";

export interface SEConversionResult {
  textHtml: string;
  chaptersXml: string;
  lastChapter: number;
}

// Files to skip - these are not actual book content
const SKIP_FILES = new Set([
  "titlepage.xhtml",
  "imprint.xhtml",
  "halftitlepage.xhtml",
  "colophon.xhtml",
  "uncopyright.xhtml",
  "loi.xhtml",
  "toc.xhtml",
  "endnotes.xhtml",
]);

function parseSpineFromOpf(opfContent: string): string[] | null {
  const spineMatch = opfContent.match(/<spine[^>]*>([\s\S]*?)<\/spine>/);
  if (!spineMatch) return null;

  const itemrefs = [...spineMatch[1].matchAll(/idref="([^"]+)"/g)];
  return itemrefs.map((m) => m[1]);
}

async function getSpineOrder(bookDir: string, repoName: string): Promise<string[] | null> {
  const localOpfPath = path.join(bookDir, "content.opf");
  if (fs.existsSync(localOpfPath)) {
    const opfContent = fs.readFileSync(localOpfPath, "utf-8");
    const spine = parseSpineFromOpf(opfContent);
    if (spine) return spine;
  }

  try {
    const url = `https://raw.githubusercontent.com/standardebooks/${repoName}/refs/heads/master/src/epub/content.opf`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const xml = await response.text();
    return parseSpineFromOpf(xml);
  } catch {
    return null;
  }
}

function naturalSort(files: string[]): string[] {
  return files.sort((a, b) => {
    const partsA = a.split(/(\d+)/);
    const partsB = b.split(/(\d+)/);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || "";
      const partB = partsB[i] || "";

      const numA = parseInt(partA, 10);
      const numB = parseInt(partB, 10);

      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      } else {
        if (partA !== partB) return partA.localeCompare(partB);
      }
    }
    return 0;
  });
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function extractTextContent(element: Element): string {
  return (element.textContent || "").replace(/\s+/g, " ").trim();
}

function htmlToValidXml(html: string): string {
  return html
    .replace(/&nbsp;/g, "&#160;")
    .replace(/<br\s*>/gi, "<br/>")
    .replace(/<hr\s*>/gi, "<hr/>")
    .replace(/<img([^>]*[^/])>/gi, "<img$1/>")
    .replace(/\s+xmlns(:[a-z0-9]+)?="[^"]*"/gi, "")
    .replace(/\s+(ns\d+|epub):type="([^"]*)"/gi, ' data-epub-type="$2"')
    .replace(/\s+(ns\d+|epub):[a-z-]+="[^"]*"/gi, "")
    .replace(/<(\/?)(ns\d+|epub):([a-z-]+)/gi, "<$1$3");
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function convertCharacterMentionsInStageDirection(element: Element): void {
  const personas = element.querySelectorAll('b[epub\\:type="z3998:persona"]');
  for (const persona of Array.from(personas)) {
    const name = (persona.textContent || "").trim();
    const slug = slugify(name);
    const span = element.ownerDocument.createElement("span");
    span.setAttribute("data-c", slug);
    span.setAttribute("data-enters", "");
    span.textContent = name;
    persona.replaceWith(span);
  }
}

function extractDialogueLines(cell: Element, doc: Document): Element[] {
  const lines: Element[] = [];

  const inlineStageDirections = cell.querySelectorAll('i[epub\\:type="z3998:stage-direction"]');
  for (const sd of Array.from(inlineStageDirections)) {
    const span = doc.createElement("span");
    span.className = "inline-stage-direction";
    span.innerHTML = sd.innerHTML;
    sd.replaceWith(span);
  }

  const verseBlock = cell.querySelector('[epub\\:type="z3998:verse"], [data-epub-type="z3998:verse"]');
  if (verseBlock) {
    const verseParagraphs = verseBlock.querySelectorAll("p");
    if (verseParagraphs.length > 0) {
      for (const vp of Array.from(verseParagraphs)) {
        const p = doc.createElement("p");
        p.innerHTML = vp.innerHTML;
        lines.push(p);
      }
    } else {
      const p = doc.createElement("p");
      p.innerHTML = verseBlock.innerHTML;
      lines.push(p);
    }
    return lines;
  }

  const directP = cell.querySelector(":scope > p");
  if (directP && cell.children.length === 1) {
    const p = doc.createElement("p");
    p.innerHTML = directP.innerHTML;
    lines.push(p);
    return lines;
  }

  const text = (cell.textContent || "").trim();
  if (text) {
    const p = doc.createElement("p");
    p.innerHTML = cell.innerHTML;
    lines.push(p);
  }

  return lines;
}

function isDramaTable(table: Element): boolean {
  const epubType = table.getAttribute("epub:type") || table.getAttribute("data-epub-type") || "";
  if (epubType.includes("drama")) return true;
  const hasPersonaCells =
    table.querySelectorAll('td[epub\\:type*="persona"], td[data-epub-type*="persona"]').length > 0;
  if (hasPersonaCells) return true;
  const hasStageDirections =
    table.querySelectorAll('i[epub\\:type*="stage-direction"], i[data-epub-type*="stage-direction"]').length > 0;
  return hasStageDirections;
}

function detectChapterFormat(section: Element): "play" | "mixed" | "prose" {
  const allTables = section.querySelectorAll("table");
  const dramaTables = Array.from(allTables).filter(isDramaTable);
  const hasDramaTables = dramaTables.length > 0;

  const proseParas = Array.from(section.querySelectorAll("p")).filter((p) => {
    const isInsideTable = p.closest("table");
    return !isInsideTable;
  });
  const hasProse = proseParas.length > 0;

  if (hasDramaTables && hasProse) return "mixed";
  if (hasDramaTables) return "play";
  return "prose";
}

function annotateDramaTables(doc: Document): void {
  const tables = doc.querySelectorAll("table");

  for (const table of Array.from(tables)) {
    if (!isDramaTable(table)) continue;

    table.setAttribute("data-drama", "");

    const rows = table.querySelectorAll("tr");
    for (const row of Array.from(rows)) {
      const cells = row.querySelectorAll("td");
      if (cells.length === 0) continue;

      const firstCell = cells[0];
      const personaType = firstCell?.getAttribute("epub:type") || firstCell?.getAttribute("data-epub-type") || "";

      if (personaType.includes("z3998:persona")) {
        const speakerName = (firstCell.textContent || "").trim();
        const speakerSlug = slugify(speakerName);
        row.setAttribute("data-speaker", speakerSlug);
        firstCell.setAttribute("data-persona", "");
      }
    }
  }
}

function convertDramaTablesToPlayFormat(doc: Document): void {
  const tables = doc.querySelectorAll("table");

  for (const table of Array.from(tables)) {
    const parent = table.parentElement;
    if (!parent) continue;

    const rows = table.querySelectorAll("tr");
    const fragment = doc.createDocumentFragment();

    for (const row of Array.from(rows)) {
      const cells = row.querySelectorAll("td");
      if (cells.length === 0) continue;

      const firstCell = cells[0];
      const secondCell = cells[1];

      const personaType = firstCell?.getAttribute("epub:type") || "";
      const isPersona = personaType.includes("z3998:persona");

      if (isPersona && secondCell) {
        const speakerName = (firstCell.textContent || "").trim();
        const speakerSlug = slugify(speakerName);

        const speechDiv = doc.createElement("div");
        speechDiv.setAttribute("data-speaker", speakerSlug);

        const labelP = doc.createElement("p");
        labelP.setAttribute("data-speaker-label", "");
        labelP.textContent = speakerName.toUpperCase();
        speechDiv.appendChild(labelP);

        const dialogueLines = extractDialogueLines(secondCell, doc);
        for (const line of dialogueLines) {
          speechDiv.appendChild(line);
        }

        fragment.appendChild(speechDiv);
      } else if (secondCell) {
        const stageDirection = secondCell.querySelector('i[epub\\:type="z3998:stage-direction"]');
        if (stageDirection) {
          convertCharacterMentionsInStageDirection(stageDirection);
          const p = doc.createElement("p");
          p.setAttribute("data-stage-direction", "");
          const em = doc.createElement("em");
          em.innerHTML = stageDirection.innerHTML;
          p.appendChild(em);
          fragment.appendChild(p);
        } else if (secondCell.textContent?.trim()) {
          const p = doc.createElement("p");
          const lines = extractDialogueLines(secondCell, doc);
          if (lines.length > 0) {
            p.innerHTML = lines[0].innerHTML;
          }
          fragment.appendChild(p);
        }
      } else if (firstCell) {
        const stageDirection = firstCell.querySelector('i[epub\\:type="z3998:stage-direction"]');
        if (stageDirection) {
          convertCharacterMentionsInStageDirection(stageDirection);
          const p = doc.createElement("p");
          p.setAttribute("data-stage-direction", "");
          const em = doc.createElement("em");
          em.innerHTML = stageDirection.innerHTML;
          p.appendChild(em);
          fragment.appendChild(p);
        }
      }
    }

    parent.replaceChild(fragment, table);
  }
}

function extractChaptersFromFile(
  file: { filename: string; content: string },
  startChapter: number,
): { chapters: { number: number; title: string; content: string }[]; htmlParts: string[]; nextChapter: number } {
  const dom = new JSDOM(file.content, { contentType: "application/xhtml+xml" });
  const doc = dom.window.document;
  const body = doc.querySelector("body");

  if (!body) return { chapters: [], htmlParts: [], nextChapter: startChapter };

  const article = body.querySelector("article, section") || body;
  const chapterFormat = detectChapterFormat(article as Element);

  if (chapterFormat === "play") {
    convertDramaTablesToPlayFormat(doc);
  } else {
    annotateDramaTables(doc);
  }

  const allNestedSections = article.querySelectorAll(":scope > section[data-epub-type], :scope > section[epub\\:type]");
  const nestedChapterSections = Array.from(allNestedSections).filter((section) => {
    const epubType = section.getAttribute("data-epub-type") || section.getAttribute("epub:type") || "";
    return epubType === "chapter" || epubType.split(" ").includes("chapter");
  });

  const chapters: { number: number; title: string; content: string }[] = [];
  const htmlParts: string[] = [];
  let chapterCounter = startChapter;

  if (nestedChapterSections.length > 0) {
    const mainTitleEl = article.querySelector(":scope > h1, :scope > h2, :scope > header h1, :scope > header h2");
    const mainTitle = mainTitleEl ? extractTextContent(mainTitleEl) : null;

    const preambleNodes: Node[] = [];
    for (const child of Array.from(article.childNodes)) {
      if (child.nodeType === 1 && (child as Element).tagName?.toLowerCase() === "section") break;
      preambleNodes.push(child);
    }

    const sectionsToProcess = Array.from(nestedChapterSections) as Element[];

    for (let i = 0; i < sectionsToProcess.length; i++) {
      const section = sectionsToProcess[i];
      const titleEl = section.querySelector("h2, h3, h4");
      let title = titleEl ? extractTextContent(titleEl) : `Section ${chapterCounter}`;

      if (mainTitle && title !== mainTitle) {
        title = `${mainTitle}: ${title}`;
      }

      let sectionHtml: string;
      if (i === 0 && preambleNodes.length > 0) {
        let preambleHtml = "";
        for (const node of preambleNodes) {
          if (node.nodeType === 1) {
            preambleHtml += (node as Element).outerHTML;
          } else if (node.nodeType === 3 && node.textContent?.trim()) {
            preambleHtml += node.textContent;
          }
        }
        sectionHtml = htmlToValidXml(preambleHtml + section.innerHTML);
        if (mainTitle) title = mainTitle;
      } else {
        sectionHtml = htmlToValidXml(section.innerHTML);
      }

      // Preserve section-level epub:type for CSS targeting (dedication, epigraph, etc.)
      const sectionEpubType = section.getAttribute("epub:type") || section.getAttribute("data-epub-type") || "";
      const epubTypeAttr = sectionEpubType ? ` data-epub-type="${sectionEpubType}"` : "";
      const formatAttr = chapterFormat !== "prose" ? ` data-chapter-format="${chapterFormat}"` : "";
      htmlParts.push(
        `<section data-chapter="${chapterCounter}"${formatAttr}${epubTypeAttr}>\n${sectionHtml}\n</section>`,
      );
      chapters.push({
        number: chapterCounter,
        title: escapeXml(title),
        content: escapeXml(extractTextContent(section).substring(0, 500)),
      });
      chapterCounter++;
    }
  } else {
    const titleEl = article.querySelector("h1, h2, header h1, header h2");
    const title = titleEl ? extractTextContent(titleEl) : file.filename.replace(".xhtml", "");

    const innerHTML = htmlToValidXml(article.innerHTML);
    // Preserve article/section-level epub:type for CSS targeting (dedication, epigraph, etc.)
    const articleEpubType = article.getAttribute("epub:type") || article.getAttribute("data-epub-type") || "";
    const epubTypeAttr = articleEpubType ? ` data-epub-type="${articleEpubType}"` : "";
    const formatAttr = chapterFormat !== "prose" ? ` data-chapter-format="${chapterFormat}"` : "";
    htmlParts.push(`<section data-chapter="${chapterCounter}"${formatAttr}${epubTypeAttr}>\n${innerHTML}\n</section>`);

    chapters.push({
      number: chapterCounter,
      title: escapeXml(title),
      content: escapeXml(extractTextContent(article).substring(0, 500)),
    });
    chapterCounter++;
  }

  return { chapters, htmlParts, nextChapter: chapterCounter };
}

export function convertSeXhtmlToHtml(xhtmlFiles: { filename: string; content: string }[]): SEConversionResult {
  const allChapters: { number: number; title: string; content: string }[] = [];
  const allHtmlParts: string[] = [];
  let chapterCounter = 1;

  for (const file of xhtmlFiles) {
    const result = extractChaptersFromFile(file, chapterCounter);
    allChapters.push(...result.chapters);
    allHtmlParts.push(...result.htmlParts);
    chapterCounter = result.nextChapter;
  }

  const textHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${allHtmlParts.join("\n")}</body></html>`;

  const chaptersXml = `<chapters>\n${allChapters
    .map(
      (ch: { number: number; title: string; content: string }) =>
        `<chapter number="${ch.number}"><title>${ch.title}</title><content>${ch.content}</content></chapter>`,
    )
    .join("\n")}\n</chapters>`;

  return { textHtml, chaptersXml, lastChapter: chapterCounter - 1 };
}

export async function convertSEBook(bookSlug: string): Promise<SEConversionResult> {
  const bookDir = path.resolve(__dirname, `../../../standardebooks-data/books/${bookSlug}`);
  const textDir = path.join(bookDir, "text");

  if (!fs.existsSync(textDir)) {
    throw new Error(`Book text directory not found: ${textDir}`);
  }

  const availableFiles = new Set(fs.readdirSync(textDir).filter((f) => f.endsWith(".xhtml")));

  const metadataPath = path.join(bookDir, "metadata.json");
  let repoName = bookSlug;
  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      if (metadata.repoName) repoName = metadata.repoName;
    } catch {}
  }

  let orderedFiles: string[];
  const spineOrder = await getSpineOrder(bookDir, repoName);

  if (spineOrder) {
    orderedFiles = spineOrder.filter((f: string) => availableFiles.has(f) && !SKIP_FILES.has(f));
    console.log(`[SE Converter] Using spine order from content.opf (${orderedFiles.length} files)`);
  } else {
    orderedFiles = naturalSort([...availableFiles].filter((f) => !SKIP_FILES.has(f)));
    console.log(`[SE Converter] Using natural sort fallback (${orderedFiles.length} files)`);
  }

  const xhtmlFiles = orderedFiles.map((filename) => ({
    filename,
    content: fs.readFileSync(path.join(textDir, filename), "utf-8"),
  }));

  return convertSeXhtmlToHtml(xhtmlFiles);
}

function wrapInRichXml(html: string): string {
  const dom = new JSDOM(html);
  const body = dom.window.document.body;
  const content = htmlToValidXml(body.innerHTML);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<main>\n<body>${content}</body>\n</main>`;
}

export async function convertAndSaveSEBook(bookSlug: string): Promise<void> {
  const result = await convertSEBook(bookSlug);

  const bookDir = path.resolve(__dirname, `../../../books-data/${bookSlug}`);
  const inputDir = path.join(bookDir, "input");

  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(path.join(bookDir, "output"), { recursive: true });
  fs.mkdirSync(path.join(bookDir, "temporary-output"), { recursive: true });

  const richXml = wrapInRichXml(result.textHtml);
  fs.writeFileSync(path.join(inputDir, "rich.xml"), richXml, "utf8");

  console.log(`[SE Converter] ${bookSlug} saved to ${inputDir}/rich.xml`);
}

if (require.main === module) {
  const bookSlug = process.argv[2];
  if (!bookSlug) {
    console.error("Usage: bun run src/tools/se-converter/index.ts <book-slug>");
    process.exit(1);
  }
  convertAndSaveSEBook(bookSlug);
}
