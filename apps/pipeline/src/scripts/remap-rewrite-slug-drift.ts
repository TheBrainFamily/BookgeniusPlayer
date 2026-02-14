#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import { ensureDomParser } from "../lib/domParser";

type Args = { slug: string; threshold: number; margin: number; dryRun: boolean };

type RemapDecision = {
  from: string;
  to: string;
  score: number;
  secondScore: number;
  chapter: number;
  reason: string;
};

type UnknownDecision = {
  slug: string;
  chapter: number;
  bestCandidate: string | null;
  bestScore: number;
  secondBestScore: number;
  reason: string;
};

type ChapterStats = {
  chapter: number;
  file: string;
  changed: boolean;
  remappedTokens: number;
  unknownBefore: number;
  unknownAfter: number;
};

const ROLES_FILE = "single-summary-per-person-roles.json";
const TEMP_DIR_NAME = "temporary-output";
const DEFAULT_THRESHOLD = 0.9;
const DEFAULT_MARGIN = 0.08;

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const slugIndex = args.indexOf("--slug");
  const thresholdIndex = args.indexOf("--threshold");
  const marginIndex = args.indexOf("--margin");
  const dryRun = args.includes("--dry-run");

  if (slugIndex === -1 || !args[slugIndex + 1]) {
    throw new Error(
      "Usage: bun apps/pipeline/src/scripts/remap-rewrite-slug-drift.ts --slug <book-slug> [--threshold 0.9] [--margin 0.08] [--dry-run]",
    );
  }

  return {
    slug: args[slugIndex + 1],
    threshold:
      thresholdIndex !== -1 && args[thresholdIndex + 1]
        ? Number.parseFloat(args[thresholdIndex + 1])
        : DEFAULT_THRESHOLD,
    margin:
      marginIndex !== -1 && args[marginIndex + 1]
        ? Number.parseFloat(args[marginIndex + 1])
        : DEFAULT_MARGIN,
    dryRun,
  };
}

function getRepoRoot(): string {
  return path.resolve(__dirname, "../../");
}

function getBookRoot(repoRoot: string, slug: string): string {
  return path.join(repoRoot, "books-data", slug);
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

function parseKnownSlugs(bookRoot: string): string[] {
  const rolesPath = path.join(bookRoot, "output", ROLES_FILE);
  if (!fs.existsSync(rolesPath)) {
    throw new Error(`Missing roles file: ${rolesPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(rolesPath, "utf8")) as {
    characters?: Array<{ slug?: string }>;
  };
  const known = new Set<string>();
  for (const character of parsed.characters || []) {
    const slug = normalizeSlug(character.slug || "");
    if (slug) known.add(slug);
  }

  if (known.size === 0) {
    throw new Error(`No known slugs found in ${rolesPath}`);
  }
  return Array.from(known).sort();
}

function extractChapterPromptIds(tempDir: string, chapter: number): Set<string> {
  const promptPath = path.join(tempDir, `compiled-prompt-for-chapter-${chapter}-gemini2.md`);
  if (!fs.existsSync(promptPath)) {
    return new Set();
  }

  const content = fs.readFileSync(promptPath, "utf8");
  const startMarker = "### Characters List";
  const endMarker = "\n\n### Text";
  const start = content.indexOf(startMarker);
  if (start === -1) return new Set();
  const end = content.indexOf(endMarker, start);
  if (end === -1) return new Set();

  const between = content.slice(start + startMarker.length, end);
  const arrayStart = between.indexOf("[");
  const arrayEnd = between.lastIndexOf("]");
  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd < arrayStart) return new Set();

  try {
    const parsed = JSON.parse(between.slice(arrayStart, arrayEnd + 1)) as Array<{ id?: string }>;
    return new Set(parsed.map((x) => normalizeSlug(x.id || "")).filter(Boolean));
  } catch {
    return new Set();
  }
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / maxLen;
}

function getBestTwoCandidates(
  token: string,
  candidates: string[],
): { bestSlug: string | null; bestScore: number; secondScore: number } {
  let bestSlug: string | null = null;
  let bestScore = -1;
  let secondScore = -1;

  for (const candidate of candidates) {
    const score = similarity(token, candidate);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestSlug = candidate;
      continue;
    }
    if (score > secondScore) {
      secondScore = score;
    }
  }

  return { bestSlug, bestScore: Math.max(bestScore, 0), secondScore: Math.max(secondScore, 0) };
}

function splitAttributeTokens(attr: string, value: string): string[] {
  if (attr === "data-c") {
    return value
      .split(",")
      .map((token) => normalizeSlug(token))
      .filter(Boolean);
  }

  return value
    .split(/\s+/g)
    .map((token) => normalizeSlug(token))
    .filter(Boolean);
}

function joinAttributeTokens(attr: string, tokens: string[]): string {
  return attr === "data-c" ? tokens.join(",") : tokens.join(" ");
}

function getNormalizedText(html: string): string {
  ensureDomParser();
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function timestampToken(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function main() {
  const args = parseArgs();
  const repoRoot = getRepoRoot();
  const bookRoot = getBookRoot(repoRoot, args.slug);
  const tempDir = path.join(bookRoot, TEMP_DIR_NAME);

  if (!fs.existsSync(bookRoot)) {
    throw new Error(`Book root not found: ${bookRoot}`);
  }
  if (!fs.existsSync(tempDir)) {
    throw new Error(`Temporary output dir not found: ${tempDir}`);
  }

  const knownSlugs = parseKnownSlugs(bookRoot);
  const knownSet = new Set(knownSlugs);

  const chapterFiles = fs
    .readdirSync(tempDir)
    .filter((file) => /^rewritten-paragraphs-for-chapter-\d+\.xml$/.test(file))
    .sort((a, b) => {
      const chapterA = Number.parseInt(a.match(/(\d+)/)?.[1] || "0", 10);
      const chapterB = Number.parseInt(b.match(/(\d+)/)?.[1] || "0", 10);
      return chapterA - chapterB;
    });

  const remapDecisions: RemapDecision[] = [];
  const unknownDecisions: UnknownDecision[] = [];
  const chapterStats: ChapterStats[] = [];
  const remapPairCounter = new Map<
    string,
    { count: number; chapters: Set<number>; scores: number[] }
  >();

  let changedChapters = 0;
  let remappedTokens = 0;
  let unknownBeforeTotal = 0;
  let unknownAfterTotal = 0;
  let totalTokens = 0;

  const backupDir = path.join(tempDir, `manual-slug-remap-backup-${timestampToken()}`);
  if (!args.dryRun) {
    ensureDir(backupDir);
  }

  for (const file of chapterFiles) {
    const chapter = Number.parseInt(file.match(/(\d+)/)?.[1] || "0", 10);
    const chapterPath = path.join(tempDir, file);
    const originalXml = fs.readFileSync(chapterPath, "utf8");
    const chapterPromptIds = extractChapterPromptIds(tempDir, chapter);
    const scopedCandidates =
      chapterPromptIds.size > 0
        ? knownSlugs.filter((slug) => chapterPromptIds.has(slug))
        : knownSlugs;

    let chapterUnknownBefore = 0;
    let chapterUnknownAfter = 0;
    let chapterRemapped = 0;
    let chapterChanged = false;

    const rewrittenXml = originalXml.replace(
      /(data-c|data-speaker)="([^"]*)"/g,
      (_full, attrName: string, attrValue: string) => {
        const originalTokens = splitAttributeTokens(attrName, attrValue);
        if (originalTokens.length === 0) {
          return `${attrName}="${attrValue}"`;
        }

        const nextTokens: string[] = [];
        for (const token of originalTokens) {
          totalTokens += 1;
          if (knownSet.has(token)) {
            nextTokens.push(token);
            continue;
          }

          chapterUnknownBefore += 1;
          unknownBeforeTotal += 1;

          if (scopedCandidates.length === 0) {
            nextTokens.push(token);
            chapterUnknownAfter += 1;
            unknownAfterTotal += 1;
            unknownDecisions.push({
              slug: token,
              chapter,
              bestCandidate: null,
              bestScore: 0,
              secondBestScore: 0,
              reason: "no-scoped-candidates",
            });
            continue;
          }

          const { bestSlug, bestScore, secondScore } = getBestTwoCandidates(
            token,
            scopedCandidates,
          );
          const scoreMargin = bestScore - secondScore;

          if (
            bestSlug &&
            bestScore >= args.threshold &&
            scoreMargin >= args.margin &&
            bestSlug !== token
          ) {
            nextTokens.push(bestSlug);
            chapterRemapped += 1;
            remappedTokens += 1;
            chapterChanged = true;
            remapDecisions.push({
              from: token,
              to: bestSlug,
              score: bestScore,
              secondScore,
              chapter,
              reason: "high-confidence",
            });
            const key = `${token}=>${bestSlug}`;
            if (!remapPairCounter.has(key)) {
              remapPairCounter.set(key, { count: 0, chapters: new Set(), scores: [] });
            }
            const pair = remapPairCounter.get(key)!;
            pair.count += 1;
            pair.chapters.add(chapter);
            pair.scores.push(bestScore);
          } else {
            nextTokens.push(token);
            chapterUnknownAfter += 1;
            unknownAfterTotal += 1;
            unknownDecisions.push({
              slug: token,
              chapter,
              bestCandidate: bestSlug,
              bestScore,
              secondBestScore: secondScore,
              reason:
                bestSlug === token
                  ? "already-equal"
                  : bestScore < args.threshold
                    ? "below-threshold"
                    : "insufficient-margin",
            });
          }
        }

        const nextValue = joinAttributeTokens(attrName, nextTokens);
        if (nextValue !== attrValue) {
          chapterChanged = true;
        }
        return `${attrName}="${nextValue}"`;
      },
    );

    if (chapterChanged) {
      const beforeText = getNormalizedText(originalXml);
      const afterText = getNormalizedText(rewrittenXml);
      if (beforeText !== afterText) {
        throw new Error(
          `Visible text changed for chapter ${chapter}. Aborting remap to preserve invariants.`,
        );
      }
      if (chapterUnknownAfter > chapterUnknownBefore) {
        throw new Error(
          `Unknown slug count increased for chapter ${chapter} (${chapterUnknownBefore} -> ${chapterUnknownAfter}).`,
        );
      }
    }

    if (chapterChanged && !args.dryRun) {
      fs.copyFileSync(chapterPath, path.join(backupDir, file));
      fs.writeFileSync(chapterPath, rewrittenXml, "utf8");
      changedChapters += 1;
    } else if (chapterChanged && args.dryRun) {
      changedChapters += 1;
    }

    chapterStats.push({
      chapter,
      file,
      changed: chapterChanged,
      remappedTokens: chapterRemapped,
      unknownBefore: chapterUnknownBefore,
      unknownAfter: chapterUnknownAfter,
    });
  }

  const remapPairs = Array.from(remapPairCounter.entries())
    .map(([key, value]) => {
      const [from, to] = key.split("=>");
      const minScore = Math.min(...value.scores);
      const maxScore = Math.max(...value.scores);
      const avgScore = value.scores.reduce((sum, score) => sum + score, 0) / value.scores.length;
      return {
        from,
        to,
        count: value.count,
        chapters: Array.from(value.chapters).sort((a, b) => a - b),
        minScore: Number(minScore.toFixed(4)),
        maxScore: Number(maxScore.toFixed(4)),
        avgScore: Number(avgScore.toFixed(4)),
      };
    })
    .sort((a, b) => b.count - a.count);

  const unknownSummary = new Map<
    string,
    {
      count: number;
      chapters: Set<number>;
      bestCandidate: string | null;
      bestScore: number;
      reason: string;
    }
  >();
  for (const decision of unknownDecisions) {
    if (!unknownSummary.has(decision.slug)) {
      unknownSummary.set(decision.slug, {
        count: 0,
        chapters: new Set(),
        bestCandidate: decision.bestCandidate,
        bestScore: decision.bestScore,
        reason: decision.reason,
      });
    }
    const entry = unknownSummary.get(decision.slug)!;
    entry.count += 1;
    entry.chapters.add(decision.chapter);
    if (decision.bestScore > entry.bestScore) {
      entry.bestScore = decision.bestScore;
      entry.bestCandidate = decision.bestCandidate;
      entry.reason = decision.reason;
    }
  }

  const topUnknown = Array.from(unknownSummary.entries())
    .map(([slug, info]) => ({
      slug,
      count: info.count,
      chapters: Array.from(info.chapters)
        .sort((a, b) => a - b)
        .slice(0, 12),
      bestCandidate: info.bestCandidate,
      bestScore: Number(info.bestScore.toFixed(4)),
      reason: info.reason,
    }))
    .sort((a, b) => b.count - a.count);

  const report = {
    slug: args.slug,
    dryRun: args.dryRun,
    threshold: args.threshold,
    margin: args.margin,
    generatedAt: new Date().toISOString(),
    paths: { bookRoot, tempDir, backupDir: args.dryRun ? null : backupDir },
    totals: {
      knownSlugCount: knownSlugs.length,
      chapterFileCount: chapterFiles.length,
      totalTokens,
      remappedTokens,
      unknownBeforeTotal,
      unknownAfterTotal,
      changedChapters,
    },
    remapPairs,
    topUnknown: topUnknown.slice(0, 200),
    chapterStats,
  };

  const reportPath = path.join(
    tempDir,
    `slug-drift-remap-report-${timestampToken()}${args.dryRun ? "-dry-run" : ""}.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Known slugs: ${knownSlugs.length}`);
  console.log(`Chapter files scanned: ${chapterFiles.length}`);
  console.log(`Remapped tokens: ${remappedTokens}`);
  console.log(`Unknown before: ${unknownBeforeTotal}`);
  console.log(`Unknown after: ${unknownAfterTotal}`);
  console.log(`Changed chapters: ${changedChapters}`);
  console.log(`Report: ${reportPath}`);
  if (!args.dryRun) {
    console.log(`Backup dir: ${backupDir}`);
  }
}

main();
