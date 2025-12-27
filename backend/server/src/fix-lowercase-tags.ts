import { convex, getChapterXml, getCharacterReferenceCards } from "./convex-client";
import { generateTagName } from "../../src/helpers/generateTagName";
import { stripCharacterTags } from "./chapter-xml-helpers";

const STANDARD_XML_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "div",
  "span",
  "br",
  "hr",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "blockquote",
  "q",
  "cite",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "table",
  "tr",
  "td",
  "th",
  "thead",
  "tbody",
  "a",
  "img",
  "note",
  "chapter",
]);

interface TagReplacement {
  lowercase: string;
  correct: string;
  count: number;
}

function findLowercaseCharacterTags(xml: string, validCharacterTags: string[]): TagReplacement[] {
  const tagPattern = /<\/?([A-Za-z][A-Za-z0-9-]*)([\s/>])/gi;
  const lowercaseTagCounts = new Map<string, number>();

  let match;
  while ((match = tagPattern.exec(xml)) !== null) {
    const tagName = match[1];
    const tagLower = tagName.toLowerCase();

    if (STANDARD_XML_TAGS.has(tagLower)) continue;

    const isAllLowercase = tagName === tagLower;
    if (isAllLowercase) {
      lowercaseTagCounts.set(tagName, (lowercaseTagCounts.get(tagName) || 0) + 1);
    }
  }

  const replacements: TagReplacement[] = [];

  for (const [lowercaseTag, count] of lowercaseTagCounts) {
    const matchingCharacter = validCharacterTags.find((charTag) => charTag.toLowerCase() === lowercaseTag.toLowerCase());

    if (matchingCharacter) {
      replacements.push({ lowercase: lowercaseTag, correct: matchingCharacter, count });
    }
  }

  return replacements;
}

function replaceLowercaseTags(xml: string, replacements: TagReplacement[]): string {
  let result = xml;

  for (const { lowercase, correct } of replacements) {
    const openTagRegex = new RegExp(`<${lowercase}(\\s|>|/>)`, "gi");
    result = result.replace(openTagRegex, `<${correct}$1`);

    const closeTagRegex = new RegExp(`</${lowercase}>`, "gi");
    result = result.replace(closeTagRegex, `</${correct}>`);
  }

  return result;
}

function getTextContent(xml: string): string {
  return stripCharacterTags(xml)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateTextPreserved(original: string, fixed: string): boolean {
  const originalText = getTextContent(original);
  const fixedText = getTextContent(fixed);
  return originalText === fixedText;
}

export async function fixLowercaseTags(
  bookPath: string,
  chapterNumber: number,
  options: { dryRun?: boolean } = {},
): Promise<{ success: boolean; error?: string; replacements?: TagReplacement[]; fixed?: boolean }> {
  console.log(`[fixLowercaseTags] Starting for ${bookPath} chapter ${chapterNumber}`);

  const chapterXml = await getChapterXml(bookPath, chapterNumber);
  if (!chapterXml) {
    return { success: false, error: `Chapter ${chapterNumber} not found in Convex` };
  }
  console.log(`[fixLowercaseTags] Fetched chapter XML (${chapterXml.length} chars)`);

  const characterCards = await getCharacterReferenceCards(bookPath);
  if (characterCards.length === 0) {
    return { success: false, error: "No character reference cards found" };
  }

  const validCharacterTags = characterCards.map((c) => generateTagName(c.name, true) as string);
  console.log(`[fixLowercaseTags] Found ${validCharacterTags.length} valid character tags`);

  const replacements = findLowercaseCharacterTags(chapterXml, validCharacterTags);

  if (replacements.length === 0) {
    console.log(`[fixLowercaseTags] No lowercase character tags found`);
    return { success: true, replacements: [], fixed: false };
  }

  console.log(`[fixLowercaseTags] Found ${replacements.length} tags to fix:`);
  for (const r of replacements) {
    console.log(`  ${r.lowercase} → ${r.correct} (${r.count} occurrences)`);
  }

  const fixedXml = replaceLowercaseTags(chapterXml, replacements);

  if (!validateTextPreserved(chapterXml, fixedXml)) {
    return { success: false, error: "Text content changed after fix - aborting", replacements };
  }
  console.log(`[fixLowercaseTags] ✅ Text content preserved`);

  if (options.dryRun) {
    console.log(`[fixLowercaseTags] Dry run - not uploading`);
    return { success: true, replacements, fixed: false };
  }

  console.log(`[fixLowercaseTags] Uploading fixed XML to Convex...`);
  try {
    await convex.uploadFile({
      folderPath: `${bookPath}/chapters`,
      basename: `chapter-${chapterNumber}.xml`,
      content: Buffer.from(fixedXml),
      contentType: "application/xml",
      publish: true,
      extra: { type: "chapter", chapterNumber, title: `Chapter ${chapterNumber}`, lowercaseTagsFixedAt: new Date().toISOString() },
    });
    console.log(`[fixLowercaseTags] ✅ Upload complete`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Upload failed: ${msg}`, replacements };
  }

  return { success: true, replacements, fixed: true };
}

export async function fixLowercaseTagsForBook(
  bookPath: string,
  options: { dryRun?: boolean; chapters?: number[] } = {},
): Promise<{ success: boolean; results: { chapter: number; fixed: boolean; replacements: number }[] }> {
  const results: { chapter: number; fixed: boolean; replacements: number }[] = [];

  const chapters = options.chapters || Array.from({ length: 50 }, (_, i) => i + 1);

  for (const chapter of chapters) {
    const result = await fixLowercaseTags(bookPath, chapter, options);
    if (result.error?.includes("not found")) {
      continue;
    }
    results.push({ chapter, fixed: result.fixed || false, replacements: result.replacements?.length || 0 });
  }

  return { success: true, results };
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: tsx fix-lowercase-tags.ts <book-path> <chapter-number|all> [--dry-run]");
    console.log("Examples:");
    console.log("  tsx fix-lowercase-tags.ts books/1766836328269-the-king-in-yellow 1");
    console.log("  tsx fix-lowercase-tags.ts books/1766836328269-the-king-in-yellow all --dry-run");
    process.exit(1);
  }

  const bookPath = args[0];
  const chapterArg = args[1];
  const dryRun = args.includes("--dry-run");

  if (chapterArg === "all") {
    fixLowercaseTagsForBook(bookPath, { dryRun }).then((result) => {
      console.log("\n=== Summary ===");
      const fixed = result.results.filter((r) => r.fixed || r.replacements > 0);
      if (fixed.length === 0) {
        console.log("No lowercase tags found in any chapter");
      } else {
        for (const r of fixed) {
          console.log(`Chapter ${r.chapter}: ${r.replacements} tags ${r.fixed ? "fixed" : "would be fixed"}`);
        }
      }
      process.exit(0);
    });
  } else {
    const chapterNumber = parseInt(chapterArg, 10);
    if (isNaN(chapterNumber)) {
      console.error("Chapter must be a number or 'all'");
      process.exit(1);
    }

    fixLowercaseTags(bookPath, chapterNumber, { dryRun }).then((result) => {
      if (result.success) {
        if (result.fixed) {
          console.log("✅ Lowercase tags fixed and uploaded");
        } else if (result.replacements?.length) {
          console.log("✅ Would fix (dry run)");
        } else {
          console.log("✅ No lowercase tags to fix");
        }
      } else {
        console.error(`❌ Failed: ${result.error}`);
      }
      process.exit(result.success ? 0 : 1);
    });
  }
}
