import { join } from "path";
import { existsSync, readFileSync, copyFileSync, writeFileSync } from "fs";
import { extractChapters } from "./lib/chapter-extractor";
import { CharacterRegistry } from "./lib/character-registry";
import { applyAnnotations } from "./lib/annotation-applier";
import { verifyTextInvariance } from "./lib/text-verifier";
import { processChapterStructured } from "./ai-client-structured";
import type { Annotation, ContainerAnnotation } from "./types";

const BOOKS_DATA_DIR = join(import.meta.dir, "../../pipeline/books-data");
const WORKSPACE_DIR = join(import.meta.dir, "../workspace");
const MAX_RETRIES = 2;

interface ChapterReport {
  chapterNumber: number;
  totalAnnotations: number;
  applied: number;
  failed: Annotation[];
  containerApplied: number;
  containerFailed: ContainerAnnotation[];
  textVerified: boolean;
  attempts: number;
}

export async function processBookStructured(bookSlug: string): Promise<void> {
  const richXmlPath = join(BOOKS_DATA_DIR, bookSlug, "input", "rich.xml");
  if (!existsSync(richXmlPath)) {
    console.error(`rich.xml not found: ${richXmlPath}`);
    process.exit(1);
  }

  const workspaceDir = join(WORKSPACE_DIR, bookSlug);
  console.log(`\nProcessing (structured mode): ${bookSlug}`);
  console.log(`Source: ${richXmlPath}`);
  console.log(`Workspace: ${workspaceDir}\n`);

  const chapters = extractChapters(richXmlPath, workspaceDir);
  const registry = new CharacterRegistry();
  const chapterReports: ChapterReport[] = [];

  for (const chapter of chapters) {
    console.log(`\n--- Chapter ${chapter.chapterNumber} ---`);

    let report: ChapterReport = {
      chapterNumber: chapter.chapterNumber,
      totalAnnotations: 0,
      applied: 0,
      failed: [],
      containerApplied: 0,
      containerFailed: [],
      textVerified: false,
      attempts: 0,
    };

    let success = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      report.attempts = attempt + 1;
      if (attempt > 0) {
        console.log(`  Retry ${attempt}/${MAX_RETRIES}...`);
        copyFileSync(chapter.originalFilePath, chapter.filePath);
      }

      const chapterHtml = readFileSync(chapter.originalFilePath, "utf-8");

      let annotations;
      try {
        annotations = await processChapterStructured({
          chapterHtml,
          chapterNumber: chapter.chapterNumber,
          registry,
        });
      } catch (error) {
        console.error(`  Agent error:`, error);
        continue;
      }

      report.totalAnnotations = annotations.annotations.length;

      // Apply annotations algorithmically (instant, no API calls)
      copyFileSync(chapter.originalFilePath, chapter.filePath);
      const result = applyAnnotations(chapter.filePath, annotations);

      report.applied = result.applied;
      report.failed = result.failed;
      report.containerApplied = result.containerApplied;
      report.containerFailed = result.containerFailed;

      const failRate =
        report.totalAnnotations > 0
          ? ((result.failed.length / report.totalAnnotations) * 100).toFixed(1)
          : "0";

      console.log(
        `  Applied: ${result.applied}/${report.totalAnnotations} annotations (${failRate}% failed), ${result.containerApplied} containers`,
      );

      if (result.failed.length > 0) {
        for (const f of result.failed.slice(0, 3)) {
          const search = f.searchText.slice(0, 60).replace(/\n/g, "\\n");
          console.log(`    \x1b[31mFAILED [${f.type}] ${f.slug}: "${search}..."\x1b[0m`);
        }
        if (result.failed.length > 3) {
          console.log(`    ... and ${result.failed.length - 3} more (see report.json)`);
        }
      }

      // Verify text invariance
      const verified = verifyTextInvariance(chapter.originalFilePath, chapter.filePath);
      report.textVerified = verified;
      if (!verified) {
        console.log(`  \x1b[31mText verification failed.\x1b[0m`);
        continue;
      }

      success = true;

      // Register new characters
      for (const nc of annotations.newCharacters) {
        if (!registry.has(nc.slug)) {
          registry.registerWithSlug(nc.slug, nc.name, chapter.chapterNumber);
        }
      }
      for (const ann of annotations.annotations) {
        if (!registry.has(ann.slug)) {
          registry.registerWithSlug(ann.slug, ann.slug, chapter.chapterNumber);
        }
        if (ann.reveals) {
          registry.linkIdentity({
            newSlug: ann.slug,
            previousSlug: ann.reveals,
            chapterNumber: chapter.chapterNumber,
          });
        }
      }

      break;
    }

    if (!success) {
      console.error(
        `  \x1b[31mFAILED chapter ${chapter.chapterNumber} after ${report.attempts} attempts. Restoring original.\x1b[0m`,
      );
      copyFileSync(chapter.originalFilePath, chapter.filePath);
    }

    chapterReports.push(report);
    console.log(`  Chapter ${chapter.chapterNumber} done. ${registry.size} characters known.`);
  }

  // Write report
  const totalAnnotations = chapterReports.reduce((s, r) => s + r.totalAnnotations, 0);
  const totalApplied = chapterReports.reduce((s, r) => s + r.applied, 0);
  const totalFailed = chapterReports.reduce((s, r) => s + r.failed.length, 0);

  const reportPath = join(workspaceDir, "report.json");
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        bookSlug,
        chapters: chapterReports,
        characters: registry.toJSON(),
        totalAnnotations,
        totalApplied,
        totalFailed,
      },
      null,
      2,
    ),
    "utf-8",
  );

  // Final summary
  const overallRate =
    totalAnnotations > 0 ? ((totalFailed / totalAnnotations) * 100).toFixed(1) : "0";

  console.log("\n=== Processing Complete ===");
  console.log(`Book: ${bookSlug}`);
  console.log(`Chapters: ${chapters.length}`);
  console.log(`Characters: ${registry.size}`);
  console.log(`Annotations: ${totalApplied}/${totalAnnotations} applied (${overallRate}% failed)`);
  console.log(`Report: ${reportPath}`);
  console.log("\nCharacter list:");
  console.log(JSON.stringify(registry.toJSON(), null, 2));
}
