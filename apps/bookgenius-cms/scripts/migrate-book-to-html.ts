/**
 * Migrates a book from XML+compiled HTML to the new HTML source format.
 *
 * Usage:
 *   bun tools/scripts/migrate-book-to-html.ts <book-slug> [--dry-run]
 */

import { config } from "dotenv";
import { execSync } from "child_process";
import { existsSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseHTML } from "linkedom";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../../../");

const envPath = existsSync(join(rootDir, ".env")) ? join(rootDir, ".env") : join(rootDir, "backend/.env");

config({ path: envPath });

const bookSlug = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!bookSlug) {
  console.error("Usage: bun tools/scripts/migrate-book-to-html.ts <book-slug> [--dry-run]");
  console.error("Example: bun tools/scripts/migrate-book-to-html.ts Lalka");
  process.exit(1);
}

const bookPath = `books/${bookSlug}`;

type CharacterOccurrences = { s: number[]; t: number[]; e?: number[]; x?: number[] };
type ChapterOccurrences = Record<string, CharacterOccurrences>;

function convertCompiledHtmlToSource(compiledHtml: string, occurrences?: ChapterOccurrences): string {
  const { document } = parseHTML(compiledHtml);
  const section = document.querySelector("section[data-chapter]");

  if (!section) {
    throw new Error("No section[data-chapter] found in compiled HTML");
  }

  if (occurrences) {
    injectEntersExitsFromOccurrences(section, occurrences, document);
  }

  removeDataIndexAttributes(section);
  convertAvatarPlaceholdersToDataSpeaker(section);
  convertCharacterHighlightedToDataC(section);
  unwrapTextNowrapSpans(section);
  removeHasSpeakerClass(section);
  removeEmptyClassAttributes(section);

  return section.outerHTML;
}

function injectEntersExitsFromOccurrences(section: Element, occurrences: ChapterOccurrences, document: Document): void {
  const entersByParagraph = new Map<number, string[]>();
  const exitsByParagraph = new Map<number, string[]>();

  for (const [slug, occ] of Object.entries(occurrences)) {
    for (const p of occ.e ?? []) {
      if (!entersByParagraph.has(p)) entersByParagraph.set(p, []);
      entersByParagraph.get(p)!.push(slug);
    }
    for (const p of occ.x ?? []) {
      if (!exitsByParagraph.has(p)) exitsByParagraph.set(p, []);
      exitsByParagraph.get(p)!.push(slug);
    }
  }

  if (entersByParagraph.size === 0 && exitsByParagraph.size === 0) return;

  section.querySelectorAll("[data-index]").forEach((el: Element) => {
    const idx = parseInt(el.getAttribute("data-index") || "-1", 10);
    const enters = entersByParagraph.get(idx) ?? [];
    const exits = exitsByParagraph.get(idx) ?? [];
    if (enters.length === 0 && exits.length === 0) return;

    for (const slug of enters) {
      wrapCharacterNameWithAttribute(el, slug, "data-enters", document);
    }
    for (const slug of exits) {
      wrapCharacterNameWithAttribute(el, slug, "data-exits", document);
    }
  });
}

function wrapCharacterNameWithAttribute(container: Element, slug: string, attr: string, document: Document): void {
  const existing = container.querySelector(`[data-c="${slug}"], [data-character="${slug}"]`);
  if (existing) {
    existing.setAttribute(attr, "true");
    return;
  }

  const displayName = slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  const variations = [displayName.toUpperCase(), displayName, slug.toUpperCase().replace(/-/g, " "), slug.replace(/-/g, " ")];

  const walker = document.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent || "";
    for (const variant of variations) {
      const idx = text.indexOf(variant);
      if (idx === -1) continue;

      const before = text.slice(0, idx);
      const match = text.slice(idx, idx + variant.length);
      const after = text.slice(idx + variant.length);

      const span = document.createElement("span");
      span.setAttribute("data-c", slug);
      span.setAttribute(attr, "true");
      span.textContent = match;

      const parent = node.parentNode;
      if (!parent) continue;

      if (before) parent.insertBefore(document.createTextNode(before), node);
      parent.insertBefore(span, node);
      if (after) parent.insertBefore(document.createTextNode(after), node);
      parent.removeChild(node);
      return;
    }
  }
}

function removeDataIndexAttributes(section: Element): void {
  section.querySelectorAll("[data-index]").forEach((el: Element) => {
    el.removeAttribute("data-index");
  });
}

function convertAvatarPlaceholdersToDataSpeaker(section: Element): void {
  section.querySelectorAll(".character-placeholder").forEach((el: Element) => {
    const slug = el.getAttribute("data-character");
    const isTalking = el.getAttribute("data-is-talking") === "true";
    const parent = el.parentElement;

    if (isTalking && slug && parent) {
      const playRow = parent.closest(".play-row");
      const targetElement = playRow || parent;

      const existingSpeakers = targetElement.getAttribute("data-speaker")?.split(/\s+/).filter(Boolean) ?? [];
      if (!existingSpeakers.includes(slug)) {
        existingSpeakers.push(slug);
      }
      targetElement.setAttribute("data-speaker", existingSpeakers.join(" "));
    }

    el.remove();
  });
}

function convertCharacterHighlightedToDataC(section: Element): void {
  section.querySelectorAll(".character-highlighted").forEach((el: Element) => {
    el.classList.remove("character-highlighted", "character-highlighted-activated");
    const slug = el.getAttribute("data-character");
    if (slug) {
      el.setAttribute("data-c", slug);
      el.removeAttribute("data-character");
    }
  });
}

function unwrapTextNowrapSpans(section: Element): void {
  section.querySelectorAll(".text-nowrap").forEach((el: Element) => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    }
  });
}

function removeHasSpeakerClass(section: Element): void {
  section.querySelectorAll(".has-speaker").forEach((el: Element) => {
    el.classList.remove("has-speaker");
  });
}

function removeEmptyClassAttributes(section: Element): void {
  section.querySelectorAll("[class]").forEach((el: Element) => {
    if (el.getAttribute("class")?.trim() === "") {
      el.removeAttribute("class");
    }
  });
}

function extractChapterMetadata(html: string): { chapterNumber: number; title: string | null; paragraphCount: number } {
  const { document } = parseHTML(html);
  const section = document.querySelector("section[data-chapter]");

  if (!section) {
    throw new Error("No section[data-chapter] found");
  }

  const chapterNumber = parseInt(section.getAttribute("data-chapter") || "1", 10);
  const titleEl = section.querySelector("h3, h4, h5");
  const title = titleEl?.textContent?.trim() || null;
  const paragraphCount = section.children.length;

  return { chapterNumber, title, paragraphCount };
}

function convexRun(command: string, args: Record<string, unknown>): string {
  const argsJson = JSON.stringify(args);
  const tempFile = join(rootDir, ".convex-args-temp.json");
  writeFileSync(tempFile, argsJson);
  try {
    const result = execSync(`npx convex run ${command} "$(cat ${tempFile})"`, { encoding: "utf-8", cwd: rootDir, shell: "/bin/bash" });
    return result;
  } finally {
    unlinkSync(tempFile);
  }
}

interface CompiledChapter {
  basename: string;
  url: string;
  versionId: string;
  chapterNumber: number;
  title?: string;
  paragraphCount?: number;
}

interface CompiledChapterData {
  html: string;
  occurrences: ChapterOccurrences;
  title?: string;
  paragraphCount?: number;
}

async function main() {
  console.log("");
  console.log("=========================================");
  console.log(`  MIGRATE BOOK TO HTML: ${bookSlug}`);
  console.log(dryRun ? "  (DRY RUN - no changes will be made)" : "");
  console.log("=========================================");
  console.log("");

  console.log("Step 1/4: Checking book exists...");
  let bookMeta;
  try {
    const result = convexRun("bookQueries:getBookMetadata", { bookPath });
    bookMeta = JSON.parse(result);
    if (!bookMeta) {
      console.error(`Book not found: ${bookPath}`);
      process.exit(1);
    }
  } catch (err: unknown) {
    console.error("Failed to get book metadata:", (err as Error).message);
    process.exit(1);
  }
  console.log(`Found book: ${bookMeta.name}`);
  console.log("");

  console.log("Step 2/4: Listing compiled chapters...");
  let compiledChapters: CompiledChapter[];
  try {
    const result = convexRun("bookQueries:listCompiledChapters", { bookPath });
    compiledChapters = JSON.parse(result);
    if (!compiledChapters || compiledChapters.length === 0) {
      console.error("No compiled chapters found. Is this book already migrated or not compiled?");
      process.exit(1);
    }
  } catch (err: unknown) {
    console.error("Failed to list compiled chapters:", (err as Error).message);
    process.exit(1);
  }
  console.log(`Found ${compiledChapters.length} compiled chapters.`);
  console.log("");

  console.log("Step 3/4: Converting chapters to HTML source format...");
  console.log("");

  const results: { chapterNumber: number; success: boolean; error?: string }[] = [];

  for (const chapter of compiledChapters) {
    process.stdout.write(`  Chapter ${chapter.chapterNumber}: `);

    try {
      const response = await fetch(chapter.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const compiled: CompiledChapterData = await response.json();
      const sourceHtml = convertCompiledHtmlToSource(compiled.html, compiled.occurrences);
      const metadata = extractChapterMetadata(sourceHtml);

      if (dryRun) {
        console.log(`[DRY RUN] Would convert (${metadata.paragraphCount} paragraphs, title: "${metadata.title || "none"}")`);
        results.push({ chapterNumber: chapter.chapterNumber, success: true });
        continue;
      }

      convexRun("chapterCompiler:uploadHtmlSourceChapter", {
        bookPath,
        chapterNumber: metadata.chapterNumber,
        htmlContent: sourceHtml,
        title: metadata.title,
        paragraphCount: metadata.paragraphCount,
      });

      console.log(`Uploaded (${metadata.paragraphCount} paragraphs, title: "${metadata.title || "none"}")`);
      results.push({ chapterNumber: chapter.chapterNumber, success: true });
    } catch (err: unknown) {
      console.log(`FAILED: ${(err as Error).message}`);
      results.push({ chapterNumber: chapter.chapterNumber, success: false, error: (err as Error).message });
    }
  }

  console.log("");

  console.log("Step 4/4: Summary");
  console.log("=========================================");

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);

  console.log(`  Converted: ${succeeded}/${compiledChapters.length}`);

  if (failed.length > 0) {
    console.log(`  Failed: ${failed.length}`);
    failed.forEach((f) => {
      console.log(`    - Chapter ${f.chapterNumber}: ${f.error}`);
    });
  }

  if (dryRun) {
    console.log("");
    console.log("  This was a DRY RUN. No changes were made.");
    console.log("  Run without --dry-run to perform the actual migration.");
  }

  console.log("");
  console.log("=========================================");
  console.log(`  MIGRATION ${failed.length === 0 ? "COMPLETE" : "COMPLETED WITH ERRORS"}`);
  console.log("=========================================");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
