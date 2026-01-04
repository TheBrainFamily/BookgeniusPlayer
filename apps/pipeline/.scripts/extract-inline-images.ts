import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import mime from "mime-types";

type Options = {
  bookRoot?: string; // e.g. books-data/stalin
  slug?: string; // e.g. stalin
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getBookRoot(opts: Options): string {
  if (opts.bookRoot) return opts.bookRoot;
  if (opts.slug) return path.join("books-data", opts.slug);
  throw new Error("Provide either opts.bookRoot or opts.slug");
}

function closestImmediateChildOfChapter(el: Element | null, stopAt: Element | null): Element | null {
  let current: Node | null = el;
  while (current && current !== stopAt && current.nodeType === current.ELEMENT_NODE) {
    const element = current as Element;
    if (element.parentElement?.hasAttribute("data-chapter")) return element;
    current = element.parentNode;
  }
  return null;
}

export async function extractInlineImages(opts: Options) {
  const bookRoot = getBookRoot(opts);
  const inputDir = path.join(bookRoot, "input");
  const richXmlPath = path.join(inputDir, "rich.xml");
  const assetsDir = path.join(inputDir, "assets");

  if (!fs.existsSync(richXmlPath)) {
    throw new Error(`rich.xml not found at ${richXmlPath}`);
  }

  const xmlString = fs.readFileSync(richXmlPath, "utf-8");
  // Extract inner of <main> ... </main> to avoid XML strictness; treat as HTML fragment
  const mainStart = xmlString.indexOf("<main>");
  const mainEnd = xmlString.lastIndexOf("</main>");
  if (mainStart === -1 || mainEnd === -1) throw new Error("<main> wrapper not found in rich.xml");
  const insideMain = xmlString.slice(mainStart + "<main>".length, mainEnd);

  // Get inner HTML of <body> ... </body>
  const bodyMatch = insideMain.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) throw new Error("<body> not found inside <main> in rich.xml");
  const bodyInnerHtml = bodyMatch[1];

  // Parse fragment as lenient HTML
  const fragment = JSDOM.fragment(bodyInnerHtml);

  ensureDir(assetsDir);

  // Track counts per chapter-paragraph for suffixing duplicates
  const counters = new Map<string, number>();

  const sections = Array.from(fragment.querySelectorAll("section[data-chapter]"));

  sections.forEach((section) => {
    const chapter = section.getAttribute("data-chapter") || "0";
    const imgs = Array.from(section.querySelectorAll("img"));

    imgs.forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (!src.startsWith("data:")) return; // Only handle data URLs

      // Find the closest ancestor with data-index (paragraph index). Include self.
      const anchor = closestImmediateChildOfChapter(img as unknown as Element, section as unknown as Element) || (section as unknown as Element);
      // Find the index of the anchor element within its chapter section
      const chapterSection = section as unknown as Element;
      const allChildren = Array.from(chapterSection.children);
      const paragraphIndex = allChildren.indexOf(anchor as unknown as Element).toString();

      // Parse data URL
      const match = src.match(/^data:([^;]+);base64,(.*)$/s);
      if (!match) return;
      const contentType = match[1];
      const base64Data = match[2];

      const ext = mime.extension(contentType) || "bin";
      const baseName = `${chapter}-${paragraphIndex}`;
      const key = baseName;
      const count = (counters.get(key) || 0) + 1;
      counters.set(key, count);
      const fileName = count === 1 ? `${baseName}.${ext}` : `${baseName}-${count}.${ext}`;
      const filePath = path.join(assetsDir, fileName);

      // Write file
      const buffer = Buffer.from(base64Data, "base64");
      fs.writeFileSync(filePath, buffer);

      // Update src to relative assets path
      (img as unknown as Element).setAttribute("src", `assets/${fileName}`);
    });
  });

  // Serialize DocumentFragment back to string
  const serializedBodyInner = Array.from(fragment.childNodes)
    .map((node: any) => (node.outerHTML !== undefined ? node.outerHTML : node.textContent || ""))
    .join("");

  const newInsideMain = insideMain.replace(/<body[^>]*>[\s\S]*<\/body>/i, `<body>${serializedBodyInner}</body>`);
  const newXml = xmlString.slice(0, mainStart + "<main>".length) + newInsideMain + xmlString.slice(mainEnd);
  fs.writeFileSync(
    richXmlPath,
    newXml
      .replace(/alt=''>/g, "/>")
      .replace(/alt="">/g, "/>")
      .replace(/<br>/g, "<br/>"),
    "utf-8",
  );
}

if (require.main === module) {
  (async () => {
    const arg = process.argv[2];
    if (!arg) {
      console.error("Usage: tsx .scripts/extract-inline-images.ts <book-slug|book-root-path>");
      process.exit(1);
    }
    const isPath = arg.includes("/") || arg.includes("\\");
    await extractInlineImages(isPath ? { bookRoot: arg } : { slug: arg });
    console.log("Extracted inline images and updated rich.xml");
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
