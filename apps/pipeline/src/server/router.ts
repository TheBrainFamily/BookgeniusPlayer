import { z } from "zod";
import { procedure, router } from "./trpc";
import { type JobStatus, StartPipelineInput } from "../shared/pipelineTypes";
import { jobs, startPipeline, styleSelectionCallbacks } from "./pipeline";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { setCurrentBook } from "../../src/helpers/getCurrentBook";
import { convertBook } from "../../src/tools/fb2-converter/index";
import { extractInlineImages } from "../../.scripts/extract-inline-images";
import { generateSingleChapterSummary } from "../../src/tools/new-tooling/get-chapter-by-chapter-with-paragraphs-json-summary";
import {
  computeBatchEmbeddingsThroughHTTP,
  type BookEmbeddings,
  type DocumentWithEmbeddings,
  type Document,
} from "../../src/services/answer-server/create-paragraph-embeddings";
import { createR2Client } from "./upload-books-to-r2";
import { readBookFile } from "../../src/helpers/readBookFile";
import { FILE_TYPE } from "../../src/helpers/filesHelpers";
import * as cheerio from "cheerio";
import * as wl from "./wolne-lektury";
import {
  readStyleSelection,
  getRemainingTimeMs,
  setUserStyleDescription,
  setUserStyleExpanded,
  setStyleChoice,
  setPreviewsGenerated,
} from "./style-selection";
import { expandUserStyleDescription } from "../../src/tools/new-tooling/create-graphical-style";
import { convertAndSaveSEBook } from "../../src/tools/se-converter/index";
import { generateStylePreview } from "../../src/tools/new-tooling/generate-prompts-for-backgrounds";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const DEFAULT_EBOOK_CONVERT = "/Applications/calibre.app/Contents/MacOS/ebook-convert";

async function runEbookConvert(bin: string, inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [inputPath, outputPath], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`ebook-convert exited with ${code}`)),
    );
  });
}

export const appRouter = router({
  startPipeline: procedure.input(StartPipelineInput).mutation(async ({ input }) => {
    const job = await startPipeline(input);
    return { jobId: job.id, slug: job.slug };
  }),

  prepareFromEpub: procedure
    .input(z.object({ epubPath: z.string(), slug: z.string().optional() }))
    .mutation(async ({ input }) => {
      const repoRoot = path.resolve(__dirname, "../../");
      try {
        process.chdir(repoRoot);
      } catch {}
      const epubPath = input.epubPath;
      const slug = input.slug || slugify(path.basename(epubPath, path.extname(epubPath)));
      const bookRoot = path.join(repoRoot, "books-data", slug);
      const inputDir = path.join(bookRoot, "input");
      ensureDir(inputDir);
      ensureDir(path.join(bookRoot, "output"));
      ensureDir(path.join(bookRoot, "temporary-output"));
      const fb2Path = path.join(inputDir, `${slug}.fb2`);
      const bin = process.env.EBOOK_CONVERT_BIN || DEFAULT_EBOOK_CONVERT;
      if (!fs.existsSync(bin)) throw new Error(`ebook-convert not found at ${bin}`);
      await runEbookConvert(bin, epubPath, fb2Path);
      setCurrentBook(path.join("books-data", slug));
      console.log("Converting book...");
      convertBook(slug, 1, 0);
      await extractInlineImages({ slug });
      const richPath = path.join(bookRoot, "input", "rich.xml");
      const rich = fs.readFileSync(richPath, "utf8");
      return { slug, rich };
    }),

  prepareFromFb2: procedure
    .input(z.object({ fb2Path: z.string(), slug: z.string().optional() }))
    .mutation(async ({ input }) => {
      const repoRoot = path.resolve(__dirname, "../../");
      try {
        process.chdir(repoRoot);
      } catch {}
      const fb2Path = input.fb2Path;
      const slug = input.slug || slugify(path.basename(fb2Path, path.extname(fb2Path)));
      const bookRoot = path.join(repoRoot, "books-data", slug);
      const inputDir = path.join(bookRoot, "input");
      ensureDir(inputDir);
      ensureDir(path.join(bookRoot, "output"));
      ensureDir(path.join(bookRoot, "temporary-output"));
      // Copy the uploaded FB2 file to the input directory
      fs.copyFileSync(fb2Path, path.join(inputDir, `${slug}.fb2`));
      setCurrentBook(path.join("books-data", slug));
      console.log("Converting book...");
      convertBook(slug, 1, 0);
      const richPath = path.join(bookRoot, "input", "rich.xml");
      const rich = fs.readFileSync(richPath, "utf8");
      return { slug, rich };
    }),

  getRichXml: procedure.input(z.object({ slug: z.string() })).query(({ input }) => {
    const repoRoot = path.resolve(__dirname, "../../");
    const richPath = path.join(repoRoot, "books-data", input.slug, "input", "rich.xml");
    const rich = fs.readFileSync(richPath, "utf8");
    return { rich };
  }),

  saveRichXml: procedure
    .input(z.object({ slug: z.string(), rich: z.string() }))
    .mutation(({ input }) => {
      const repoRoot = path.resolve(__dirname, "../../");
      const richPath = path.join(repoRoot, "books-data", input.slug, "input", "rich.xml");
      ensureDir(path.dirname(richPath));

      // Debug logging to verify fix
      const openingSections = (input.rich.match(/<section/g) || []).length;
      const closingSections = (input.rich.match(/<\/section>/g) || []).length;
      console.log(
        `[saveRichXml] Writing rich.xml for ${input.slug} - opens: ${openingSections}, closes: ${closingSections}`,
      );
      if (openingSections !== closingSections) {
        console.error(`[saveRichXml ERROR] Unbalanced sections!`);
      }

      fs.writeFileSync(richPath, input.rich, "utf8");
      return { ok: true };
    }),

  getJobStatus: procedure.input(z.object({ jobId: z.string() })).query(({ input }) => {
    const job = jobs.get(input.jobId);
    if (!job) throw new Error("Job not found");

    const repoRoot = path.resolve(__dirname, "../../");
    const bookRoot = path.join(repoRoot, "books-data", job.slug);
    const styleState = readStyleSelection(bookRoot);

    const status: JobStatus = {
      jobId: job.id,
      slug: job.slug,
      currentStep: job.currentStep,
      activeSteps: job.activeSteps,
      steps: job.steps,
      logs: job.logs.slice(-200),
      error: job.error,
      downloadUrl: job.downloadUrl,
      packagePath: job.packagePath,
      styleSelection: styleState
        ? {
            status: styleState.status,
            remainingTimeMs: getRemainingTimeMs(styleState),
            autoStyle: styleState.autoStyle,
            userStyle: styleState.userStyle,
            previews: styleState.previews,
            selected: styleState.selected,
          }
        : undefined,
    };
    return status;
  }),

  regenerateChapterEmbeddings: procedure
    .input(
      z.object({
        bookSlug: z.string(),
        chapterNumber: z.number(),
        chapterXml: z.string(),
        bookLanguage: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { bookSlug, chapterNumber, chapterXml, bookLanguage = "English" } = input;

      console.log(
        `[regenerateChapterEmbeddings] Starting for ${bookSlug} chapter ${chapterNumber}`,
      );

      setCurrentBook(path.join("books-data", bookSlug));

      const $ = cheerio.load(chapterXml, { xmlMode: true });
      const paragraphs: { text: string; dataIndex: number }[] = [];
      let index = 0;
      $("Chapter > *").each((_, elem) => {
        const $elem = $(elem);
        const $clone = $elem.clone();
        $clone.find("note").remove();
        $clone.find("a").remove();
        const text = $clone.text().trim();
        if (text) {
          paragraphs.push({ text, dataIndex: index });
        }
        index++;
      });
      console.log(
        `[regenerateChapterEmbeddings] Extracted ${paragraphs.length} paragraphs from XML`,
      );

      let rollingSummary: string;
      try {
        rollingSummary = readBookFile(
          `summaries-chapter-by-chapter-${chapterNumber}.txt`,
          FILE_TYPE.TEMPORARY,
        );
      } catch {
        throw new Error(
          `Rolling summary not found for chapter ${chapterNumber}. Run full pipeline first.`,
        );
      }

      console.log(`[regenerateChapterEmbeddings] Generating summary for chapter ${chapterNumber}`);
      const chapterSummary = await generateSingleChapterSummary({
        chapterNum: chapterNumber,
        paragraphs,
        rollingSummary,
        bookLanguage,
      });

      const documents: Document[] = chapterSummary.chapterSummary.chapterBulletPoints.map(
        (bulletPoint) => {
          const renderedText = bulletPoint.paragraphNumbers
            .map((p) =>
              paragraphs
                .filter((pfc) => pfc.dataIndex === p)
                .map((pfc) => pfc.text)
                .join(" "),
            )
            .join("\n");

          return {
            text: `<Summary>${bulletPoint.paragraphsSummary}</Summary> <Text>${renderedText}</Text>`,
            chapter: chapterNumber,
            paragraphNumber: bulletPoint.mainParagraphNumber,
          };
        },
      );

      const pureSummaryDocuments: Document[] =
        chapterSummary.chapterSummary.chapterBulletPoints.map((bulletPoint) => ({
          text: bulletPoint.paragraphsSummary,
          chapter: chapterNumber,
          paragraphNumber: bulletPoint.mainParagraphNumber,
        }));

      console.log(
        `[regenerateChapterEmbeddings] Generating embeddings for ${documents.length + pureSummaryDocuments.length} documents`,
      );
      const newChapterEmbeddings = await computeBatchEmbeddingsThroughHTTP([
        ...documents,
        ...pureSummaryDocuments,
      ]);

      const r2 = createR2Client();
      const embeddingsKey = `answer-server-data/${bookSlug}/embeddings.json`;
      const embeddingsFile = r2.file(embeddingsKey);

      let existingEmbeddings: BookEmbeddings = new Map();
      try {
        const exists = await embeddingsFile.exists();
        if (exists) {
          const arr = (await embeddingsFile.json()) as [number, DocumentWithEmbeddings[]][];
          existingEmbeddings = new Map(arr);
          console.log(
            `[regenerateChapterEmbeddings] Loaded existing embeddings with ${existingEmbeddings.size} chapters`,
          );
        }
      } catch {
        console.log(`[regenerateChapterEmbeddings] No existing embeddings found, starting fresh`);
      }

      existingEmbeddings.set(chapterNumber, newChapterEmbeddings);

      const mergedJson = JSON.stringify(Array.from(existingEmbeddings.entries()), null, 2);
      await embeddingsFile.write(mergedJson);
      console.log(`[regenerateChapterEmbeddings] Uploaded merged embeddings to R2`);

      return {
        success: true,
        bookSlug,
        chapterNumber,
        embeddingsCount: newChapterEmbeddings.length,
      };
    }),

  searchWolneLektury: procedure.input(z.object({ query: z.string() })).query(async ({ input }) => {
    const books = await wl.searchBooks(input.query);
    return books
      .slice(0, 50)
      .map((book) => ({
        title: book.title,
        author: book.author,
        slug: book.slug,
        coverThumb: book.cover_thumb,
        hasAudio: book.has_audio,
        epoch: book.epoch,
        genre: book.genre,
        kind: book.kind,
      }));
  }),

  getWolneLekturyBook: procedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
    const book = await wl.getBookBySlug(input.slug);
    return {
      title: book.title,
      slug: book.slug,
      language: book.language,
      authors: book.authors.map((a) => a.name),
      hasFb2: !!book.fb2,
      hasEpub: !!book.epub,
      cover: book.cover,
      coverThumb: book.cover_thumb,
    };
  }),

  getWolneLekturyBookDetails: procedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const book = await wl.getBookBySlug(input.slug);
      return {
        title: book.title,
        slug: book.slug,
        language: book.language,
        authors: book.authors.map((a) => a.name),
        epochs: book.epochs.map((e) => e.name),
        genres: book.genres.map((g) => g.name),
        kinds: book.kinds.map((k) => k.name),
        audioLength: book.audio_length || null,
        fragmentHtml: book.fragment_data?.html || null,
        hasFb2: !!book.fb2,
        hasEpub: !!book.epub,
        hasAudio: book.media?.some((m) => m.type === "mp3") || false,
        cover: book.cover,
        coverThumb: book.cover_thumb,
      };
    }),

  downloadFromWolneLektury: procedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ input }) => {
      const repoRoot = path.resolve(__dirname, "../../");
      try {
        process.chdir(repoRoot);
      } catch {}

      const multiVolumePath = path.join(repoRoot, "wolnelektury-data/multi-volume-mapping.json");
      let downloadSlug = input.slug;
      let parentTitle: string | null = null;

      if (fs.existsSync(multiVolumePath)) {
        const multiVolume = JSON.parse(fs.readFileSync(multiVolumePath, "utf-8"));
        if (multiVolume[input.slug]) {
          const children = multiVolume[input.slug].children;
          if (children && children.length > 0) {
            downloadSlug = children[0].slug;
            parentTitle = multiVolume[input.slug].title;
            console.log(
              `[downloadFromWolneLektury] Multi-volume work detected, using first volume: ${downloadSlug}`,
            );
          }
        }
      }

      const { buffer, details } = await wl.downloadBookFb2(downloadSlug);

      const slug = input.slug;
      const bookRoot = path.join(repoRoot, "books-data", slug);
      const inputDir = path.join(bookRoot, "input");
      ensureDir(inputDir);
      ensureDir(path.join(bookRoot, "output"));
      ensureDir(path.join(bookRoot, "temporary-output"));

      const fb2Path = path.join(inputDir, `${slug}.fb2`);
      fs.writeFileSync(fb2Path, buffer);
      console.log(`[downloadFromWolneLektury] Saved FB2 to ${fb2Path}`);

      setCurrentBook(path.join("books-data", slug));
      console.log(`[downloadFromWolneLektury] Converting book...`);
      convertBook(slug, 1, 0);

      const richPath = path.join(bookRoot, "input", "rich.xml");
      const rich = fs.readFileSync(richPath, "utf8");

      return {
        slug,
        rich,
        title: parentTitle || details.title,
        authors: details.authors.map((a) => a.name),
      };
    }),

  getWolneLekturyCollections: procedure.query(async () => {
    const collections = await wl.getCollections();
    return collections.map((c) => ({
      title: c.title,
      slug: wl.extractSlugFromHref(c.href),
      url: c.url,
    }));
  }),

  getWolneLekturyCollection: procedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const collection = await wl.getCollectionBySlug(input.slug);
      return {
        url: collection.url,
        title: collection.title,
        books: collection.books.map((book) => ({
          title: book.title,
          author: book.author,
          slug: book.slug,
          cover: book.cover,
          coverThumb: book.cover_thumb,
          coverColor: book.cover_color,
          epoch: book.epoch,
          genre: book.genre,
          kind: book.kind,
          hasAudio: book.has_audio,
        })),
      };
    }),

  getBookDescriptions: procedure
    .input(z.object({ collectionSlug: z.string() }))
    .query(async ({ input }) => {
      const descriptionsPath = path.resolve(
        __dirname,
        `../../wolnelektury-data/generated-descriptions/${input.collectionSlug}-descriptions.json`,
      );
      if (!fs.existsSync(descriptionsPath)) {
        return { descriptions: [] };
      }
      const data = JSON.parse(fs.readFileSync(descriptionsPath, "utf-8"));
      return {
        descriptions: data.map(
          (book: { slug: string; generatedDescription?: string; generatedHook?: string }) => ({
            slug: book.slug,
            description: book.generatedDescription || "",
            hook: book.generatedHook || "",
          }),
        ),
      };
    }),

  getReadingTimes: procedure.query(async () => {
    const readingTimesPath = path.resolve(__dirname, "../../wolnelektury-data/reading-times.json");
    if (!fs.existsSync(readingTimesPath)) {
      return {};
    }
    const data = JSON.parse(fs.readFileSync(readingTimesPath, "utf-8"));
    const result: Record<string, string> = {};
    for (const [slug, info] of Object.entries(data)) {
      result[slug] = (info as { readingTimeFormatted: string }).readingTimeFormatted;
    }
    return result;
  }),

  getStandardEbooksIndex: procedure.query(async () => {
    const indexPath = path.resolve(__dirname, "../../standardebooks-data/index.json");
    if (!fs.existsSync(indexPath)) {
      return { books: [], groupedByAuthorLetter: {} };
    }
    const data = JSON.parse(fs.readFileSync(indexPath, "utf-8"));

    const descriptionsPath = path.resolve(__dirname, "../../standardebooks-data/descriptions.json");
    let descriptions: Record<string, { description: string; hook: string }> = {};
    if (fs.existsSync(descriptionsPath)) {
      descriptions = JSON.parse(fs.readFileSync(descriptionsPath, "utf-8"));
    }

    const books = (
      data.books as {
        slug: string;
        title: string;
        author: string;
        authorFileAs: string;
        description: string;
        wordCount: number;
        language: string;
        subjects: string[];
      }[]
    ).map((book) => {
      const desc = descriptions[book.slug];
      return {
        ...book,
        generatedDescription: desc?.description || book.description,
        generatedHook: desc?.hook || "",
      };
    });

    const groupedByAuthorLetter: Record<string, typeof books> = {};
    for (const book of books) {
      const firstLetter = (book.authorFileAs || book.author).charAt(0).toUpperCase();
      if (!groupedByAuthorLetter[firstLetter]) {
        groupedByAuthorLetter[firstLetter] = [];
      }
      groupedByAuthorLetter[firstLetter].push(book);
    }

    return { books, groupedByAuthorLetter };
  }),

  getStandardEbooksBook: procedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const bookDir = path.resolve(__dirname, `../../standardebooks-data/books/${input.slug}`);
      const metadataPath = path.join(bookDir, "metadata.json");

      if (!fs.existsSync(metadataPath)) {
        throw new Error(`Book not found: ${input.slug}`);
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

      const textDir = path.join(bookDir, "text");
      const chapters: { filename: string; title: string; content: string }[] = [];

      if (fs.existsSync(textDir)) {
        const files = fs
          .readdirSync(textDir)
          .filter((f) => f.endsWith(".xhtml"))
          .sort();
        for (const file of files) {
          const content = fs.readFileSync(path.join(textDir, file), "utf-8");
          const titleMatch = content.match(/<title>([^<]+)<\/title>/);
          chapters.push({
            filename: file,
            title: titleMatch ? titleMatch[1] : file.replace(".xhtml", ""),
            content,
          });
        }
      }

      const coverPath = path.join(bookDir, "images", "cover.jpg");
      const hasCover = fs.existsSync(coverPath);

      return { metadata, chapters, hasCover };
    }),

  prepareFromStandardEbooks: procedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ input }) => {
      const repoRoot = path.resolve(__dirname, "../../");
      const seBookDir = path.join(repoRoot, "standardebooks-data/books", input.slug);
      const metadataPath = path.join(seBookDir, "metadata.json");

      if (!fs.existsSync(metadataPath)) {
        throw new Error(`Standard Ebook not found: ${input.slug}`);
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

      await convertAndSaveSEBook(input.slug);

      const bookRoot = path.join(repoRoot, "books-data", input.slug);
      const richPath = path.join(bookRoot, "input", "rich.xml");
      const rich = fs.readFileSync(richPath, "utf-8");

      return { slug: input.slug, rich, title: metadata.title, author: metadata.author };
    }),

  getStyleSelectionStatus: procedure.input(z.object({ jobId: z.string() })).query(({ input }) => {
    const job = jobs.get(input.jobId);
    if (!job) throw new Error("Job not found");

    const repoRoot = path.resolve(__dirname, "../../");
    const bookRoot = path.join(repoRoot, "books-data", job.slug);
    const state = readStyleSelection(bookRoot);

    if (!state) {
      return {
        status: "not_started" as const,
        remainingTimeMs: 0,
        autoStyle: null,
        userStyle: null,
        previews: null,
        selected: null,
      };
    }

    return {
      status: state.status,
      remainingTimeMs: getRemainingTimeMs(state),
      autoStyle: state.autoStyle,
      userStyle: state.userStyle,
      previews: state.previews,
      selected: state.selected,
    };
  }),

  submitStyleDescription: procedure
    .input(z.object({ jobId: z.string(), description: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const job = jobs.get(input.jobId);
      if (!job) throw new Error("Job not found");

      const repoRoot = path.resolve(__dirname, "../../");
      const bookRoot = path.join(repoRoot, "books-data", job.slug);
      const state = readStyleSelection(bookRoot);

      if (!state) throw new Error("Style selection not initialized");
      const allowedStatuses = ["awaiting_input", "generating_auto_style", "generating_user_style"];
      if (!allowedStatuses.includes(state.status)) {
        throw new Error(`Cannot submit style in status: ${state.status}`);
      }

      if (input.description === null) {
        setUserStyleDescription(bookRoot, null);

        const callback = styleSelectionCallbacks.get(input.jobId);
        if (callback?.onUserStyleSubmitted) {
          callback.onUserStyleSubmitted(null);
        }

        return { success: true, userStyle: null };
      }

      setUserStyleDescription(bookRoot, input.description);

      setCurrentBook(path.join("books-data", job.slug));

      const periodStyle = state.autoStyle?.periodStyle || "Historical";
      const userStyle = await expandUserStyleDescription(input.description, periodStyle);

      setUserStyleExpanded(bookRoot, userStyle);

      const callback = styleSelectionCallbacks.get(input.jobId);
      if (callback?.onUserStyleSubmitted) {
        callback.onUserStyleSubmitted(userStyle);
      }

      return { success: true, userStyle };
    }),

  chooseStyle: procedure
    .input(z.object({ jobId: z.string(), choice: z.enum(["auto", "user"]) }))
    .mutation(async ({ input }) => {
      const job = jobs.get(input.jobId);
      if (!job) throw new Error("Job not found");

      const repoRoot = path.resolve(__dirname, "../../");
      const bookRoot = path.join(repoRoot, "books-data", job.slug);
      const state = readStyleSelection(bookRoot);

      if (!state) throw new Error("Style selection not initialized");
      if (state.status !== "awaiting_choice") {
        throw new Error(`Cannot choose style in status: ${state.status}`);
      }

      if (input.choice === "user" && !state.userStyle) {
        throw new Error("No user style available to choose");
      }

      setStyleChoice(bookRoot, input.choice);

      const callback = styleSelectionCallbacks.get(input.jobId);
      if (callback?.onStyleChosen) {
        callback.onStyleChosen(input.choice);
      }

      return { success: true, choice: input.choice };
    }),

  generateStylePreviews: procedure
    .input(z.object({ jobId: z.string() }))
    // eslint-disable-next-line complexity -- multiple file operations and style processing steps
    .mutation(async ({ input }) => {
      const job = jobs.get(input.jobId);
      if (!job) throw new Error("Job not found");

      const repoRoot = path.resolve(__dirname, "../../");
      const bookRoot = path.join(repoRoot, "books-data", job.slug);
      const state = readStyleSelection(bookRoot);

      if (!state) throw new Error("Style selection not initialized");
      if (!state.autoStyle) throw new Error("Auto style not yet generated");

      setCurrentBook(path.join("books-data", job.slug));

      const autoPreview = await generateStylePreview(state.autoStyle, "auto", 1);
      let userPreview = null;

      if (state.userStyle) {
        userPreview = await generateStylePreview(state.userStyle, "user", 1);
      }

      setPreviewsGenerated(
        bookRoot,
        autoPreview?.imagePath || null,
        userPreview?.imagePath || null,
        autoPreview?.avatarPath || null,
        userPreview?.avatarPath || null,
      );

      return {
        success: true,
        previews: {
          autoPreviewPath: autoPreview?.imagePath || null,
          userPreviewPath: userPreview?.imagePath || null,
          autoAvatarPath: autoPreview?.avatarPath || null,
          userAvatarPath: userPreview?.avatarPath || null,
        },
      };
    }),
});

export type AppRouter = typeof appRouter;
