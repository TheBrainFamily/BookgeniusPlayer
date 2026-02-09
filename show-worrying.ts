import { readFileSync, existsSync } from "node:fs";
import { JSDOM } from "jsdom";

const LEAF_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "td",
  "th",
  "dt",
  "dd",
  "figcaption",
  "hr",
  "cite",
]);

const CONTAINER_TAGS = new Set([
  "blockquote",
  "div",
  "section",
  "table",
  "tbody",
  "thead",
  "tfoot",
  "tr",
  "ol",
  "ul",
  "dl",
  "header",
  "footer",
  "figure",
  "aside",
  "hgroup",
]);

function extractRecursiveLeaves(element: Element): string[] {
  const leaves: string[] = [];

  function traverse(node: Element) {
    const tagName = node.tagName.toLowerCase();

    if (LEAF_TAGS.has(tagName)) {
      if (tagName === "hr") {
        leaves.push("");
      } else {
        leaves.push(node.textContent?.trim() || "");
      }
      return;
    }

    if (CONTAINER_TAGS.has(tagName)) {
      for (const child of Array.from(node.children)) {
        traverse(child as Element);
      }
    }
  }

  traverse(element);
  return leaves;
}

function normalize(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/…/g, "...")
    .replace(/\[\^?\d+\]/g, "")
    .replace(/↩/g, "")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const aNorm = normalize(a).slice(0, 200);
  const bNorm = normalize(b).slice(0, 200);
  const maxLen = Math.max(aNorm.length, bNorm.length);
  if (maxLen === 0) return 100;
  const distance = levenshtein(aNorm, bNorm);
  return ((maxLen - distance) / maxLen) * 100;
}

function extractText(embeddingText: string): string {
  const textMatch = embeddingText.match(/<Text>(.*?)<\/Text>/s);
  return textMatch ? textMatch[1].trim() : embeddingText;
}

function hasTextTag(embeddingText: string): boolean {
  return embeddingText.includes("<Text>");
}

type Bullet = {
  paragraphNumbers: number[];
  mainParagraphNumber: number;
  paragraphsSummary: string;
};

const books = [
  { slug: "1984", dataDir: "1984" },
  { slug: "1984-English", dataDir: "1984-english" },
  { slug: "Alice-Wonderland", dataDir: "alice-wonderland" },
  { slug: "Krolowa-Sniegu", dataDir: "krolowa-sniegu" },
  { slug: "Midsummer-Nights-Dream", dataDir: "midsummer-nights-dream" },
  { slug: "Othello", dataDir: "othello" },
];

const backendBase = "/Users/lukaszgandecki/projects/bookgenius/backend/books-data";
const frontendBase =
  "/Users/lukaszgandecki/projects/bookgenius/frontend/ConvexAssets/books";

for (const { slug, dataDir } of books) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`${slug}`);
  console.log("=".repeat(80));

  const summariesPath = `${backendBase}/${dataDir}/temporary-output/summaries-with-paragraphs.json`;
  const embeddingsPath = `${backendBase}/${dataDir}/temporary-output/embeddings.json`;

  if (!existsSync(summariesPath) || !existsSync(embeddingsPath)) {
    console.log(`Skipping ${slug}: missing files`);
    continue;
  }

  const summaries = JSON.parse(readFileSync(summariesPath, "utf-8")) as Array<{
    chapterSummary: { chapterBulletPoints: Bullet[] };
  }>;

  const embeddingsData = JSON.parse(readFileSync(embeddingsPath, "utf-8"), (k, v) =>
    k === "Embeddings" ? undefined : v
  ) as Array<[number, Array<{ text: string; chapter: number; paragraphNumber: number }>]>;

  let worryingCount = 0;

  for (const [chapterNum, docs] of embeddingsData) {
    const chapterPath = `${frontendBase}/${slug}/chapters-source/chapter-${chapterNum}.html`;

    if (!existsSync(chapterPath)) {
      console.log(`Missing chapter file: ${chapterPath}`);
      continue;
    }

    const bullets = summaries[chapterNum - 1]?.chapterSummary?.chapterBulletPoints;
    if (!bullets) {
      console.log(`${slug} ch${chapterNum}: no bullets found in summaries`);
      continue;
    }

    const chapterHtml = readFileSync(chapterPath, "utf-8");
    const dom = new JSDOM(chapterHtml);
    const body = dom.window.document.body;

    const allLeaves: string[] = [];
    for (const child of Array.from(body.children)) {
      allLeaves.push(...extractRecursiveLeaves(child as Element));
    }

    for (const doc of docs) {
      // Skip summary-only embeddings (those without <Text> tags)
      if (!hasTextTag(doc.text)) {
        continue;
      }

      const mainPNum = doc.paragraphNumber;

      const bullet = bullets.find((b) => b.mainParagraphNumber === mainPNum);
      if (!bullet) {
        console.log(`${slug} ch${chapterNum} main=${mainPNum}: no bullet found`);
        continue;
      }

      const pNums = bullet.paragraphNumbers;
      const embText = extractText(doc.text);

      // Paragraph numbers directly correspond to array indices
      // because index 0 is the chapter heading (e.g., "1")
      const firstIdx = pNums[0];

      if (firstIdx < 0 || firstIdx >= allLeaves.length) {
        console.log(
          `${slug} ch${chapterNum} main=${mainPNum}: index ${firstIdx} out of bounds (total ${allLeaves.length})`
        );
        continue;
      }

      const plrText = allLeaves[firstIdx];
      const sim = similarity(embText, plrText);

      if (sim < 85) {
        worryingCount++;
        const embNorm = normalize(embText);
        const plrNorm = normalize(plrText);

        console.log(
          `\n${slug} ch${chapterNum} main=${mainPNum} pNums=[${pNums.join(
            ","
          )}] sim=${sim.toFixed(1)}% embLen=${embText.length} plrLen=${plrText.length}`
        );
        console.log(`  emb: "${embNorm.slice(0, 150)}"`);
        console.log(`  plr: "${plrNorm.slice(0, 150)}"`);

        // Search for embedding text elsewhere in chapter
        const embFirst50 = embNorm.slice(0, 50);
        let foundAt = -1;
        for (let i = 0; i < allLeaves.length; i++) {
          const leafNorm = normalize(allLeaves[i]).slice(0, 50);
          if (leafNorm === embFirst50) {
            foundAt = i;
            break;
          }
        }

        if (foundAt !== -1 && foundAt !== firstIdx) {
          console.log(`  FOUND AT index=${foundAt} (expected pNums had index=${firstIdx})`);
        }
      }
    }
  }

  console.log(`\n${slug}: ${worryingCount} worrying entries\n`);
}

console.log("\nDone.");
