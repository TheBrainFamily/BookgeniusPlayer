import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";

export interface SEConversionResult {
  textHtml: string;
  chaptersXml: string;
  lastChapter: number;
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
    .replace(/\s+xmlns(:[a-z]+)?="[^"]*"/gi, "");
}

export function convertSeXhtmlToHtml(xhtmlFiles: { filename: string; content: string }[]): SEConversionResult {
  const chapters: { number: number; title: string; content: string }[] = [];
  const chapterHtmlParts: string[] = [];
  let chapterCounter = 1;

  for (const file of xhtmlFiles) {
    const dom = new JSDOM(file.content, { contentType: "application/xhtml+xml" });
    const doc = dom.window.document;
    const body = doc.querySelector("body");
    if (!body) continue;

    const article = body.querySelector("article, section") || body;
    const titleEl = body.querySelector("h1, h2, header h1, header h2");
    const title = titleEl ? extractTextContent(titleEl) : file.filename.replace(".xhtml", "");

    const innerHTML = htmlToValidXml(article.innerHTML);
    const chapterHtml = `<section data-chapter="${chapterCounter}">\n${innerHTML}\n</section>`;
    chapterHtmlParts.push(chapterHtml);

    const chapterText = extractTextContent(article);
    chapters.push({ number: chapterCounter, title: escapeXml(title), content: escapeXml(chapterText) });

    chapterCounter++;
  }

  const textHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${chapterHtmlParts.join("\n")}</body></html>`;

  const chaptersXml = `<chapters>\n${chapters
    .map((ch) => `<chapter number="${ch.number}"><title>${ch.title}</title><content>${ch.content}</content></chapter>`)
    .join("\n")}\n</chapters>`;

  return { textHtml, chaptersXml, lastChapter: chapterCounter - 1 };
}

export function convertSEBook(bookSlug: string): SEConversionResult {
  const bookDir = path.resolve(__dirname, `../../../standardebooks-data/books/${bookSlug}`);
  const textDir = path.join(bookDir, "text");

  if (!fs.existsSync(textDir)) {
    throw new Error(`Book text directory not found: ${textDir}`);
  }

  const files = fs
    .readdirSync(textDir)
    .filter((f) => f.endsWith(".xhtml"))
    .sort();

  const xhtmlFiles = files.map((filename) => ({
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

export function convertAndSaveSEBook(bookSlug: string): void {
  const result = convertSEBook(bookSlug);

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
