import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { type Step, StepLabels } from "../shared/pipelineTypes";
import { convertBook, findFb2FilePath } from "../../src/tools/fb2-converter/index";
import { parseFb2Xml } from "../../src/tools/fb2-converter/fb2Converter";
import { extractInlineImages } from "../../.scripts/extract-inline-images";
import { createBookSettings } from "../../src/helpers/createBookSettings";
import { checkIfBookDataExists } from "../../src/shared-books-data/getBooksData";
import { setCurrentBook } from "../../src/helpers/getCurrentBook";
import { getReferenceCardsForWholeBook } from "../../src/tools/new-tooling/get-reference-cards-for-whole-book";
import { writeBookFile } from "../../src/helpers/writeBookFile";
import { FILE_TYPE, getFilePath } from "../../src/helpers/filesHelpers";
import { readBookFile } from "../../src/helpers/readBookFile";
import { identifyCharactersAndRewriteParagraphs } from "../../src/tools/identifyEntityAndRewriteParagraphs";
import {
  generatePicturesForEntities,
  generatePicturePrompts,
} from "../../src/tools/new-tooling/generate-pictures-for-entities";
import { turnChapterSummariesIntoBulletPointsMappedToParagraphs } from "../../src/tools/new-tooling/get-chapter-by-chapter-with-paragraphs-json-summary";
import type { NewReferenceCardsResponse } from "../../src/types";
import {
  generateBackgrounds,
  generateStylePreview,
} from "../../src/tools/new-tooling/generate-prompts-for-backgrounds";
import {
  createGraphicalStyle,
  createGraphicalStyleFromCover,
  type GraphicalStyle,
} from "../../src/tools/new-tooling/create-graphical-style";
import { getBookSettings } from "../../src/helpers/getBookSettings";
import { generateTagName } from "../../src/helpers/generateTagName";
import { computeParagraphCount } from "../lib/paragraphCount";
import {
  initProgress,
  markStepStarted,
  markStepComplete,
  markStepError,
  getStepIndex,
  getStepOrder,
} from "./pipeline-progress";
import { convex } from "./convex-client";
import { generateEmbeddings } from "../../src/services/answer-server/create-paragraph-embeddings";
import { uploadBookFolder } from "./upload-books-to-r2";
import {
  initStyleSelection,
  readStyleSelection,
  setAutoStyleComplete,
  setPreviewsGenerated,
  setStyleChoice,
} from "./style-selection";
import { STEP_DEPENDENCIES, getReadySteps, createSchedulerState } from "./parallel-scheduler";
import { buildNotesToUploadFromNoteMap, normalizeNoteRefId } from "./notes-import";
import { isAbortError } from "../../src/helpers/abortHelpers";

export type StyleSelectionCallback = {
  onUserStyleSubmitted?: (userStyle: GraphicalStyle | null) => void;
  onStyleChosen?: (choice: "auto" | "user") => void;
};

export const styleSelectionCallbacks = new Map<string, StyleSelectionCallback>();

export type Job = {
  id: string;
  slug: string;
  bookPath: string;
  status: "pending" | "running" | "done" | "error";
  currentStep: Step;
  activeSteps: Step[];
  steps: {
    step: Step;
    status: "pending" | "running" | "done" | "error";
    startedAt?: number;
    endedAt?: number;
    message?: string;
  }[];
  logs: string[];
  error?: string;
  downloadUrl?: string;
  packagePath?: string;
};

export const jobs = new Map<string, Job>();

const DEFAULT_EBOOK_CONVERT = "/Applications/calibre.app/Contents/MacOS/ebook-convert";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

async function runEbookConvert(bin: string, inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [inputPath, outputPath], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ebook-convert exited with code ${code}`));
    });
  });
}

function setBookArg(slug: string) {
  const bookArg = path.join("books-data", slug);
  try {
    setCurrentBook(bookArg);
  } catch {
    process.argv[2] = bookArg;
  }
}

function getRepoRoot(): string {
  return path.resolve(__dirname, "../../");
}

function addLog(job: Job, message: string) {
  const ts = new Date().toISOString();
  job.logs.push(`[${ts}] ${message}`);
  console.log(`[${job.slug}] ${message}`);
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".xml": "application/xml",
    ".json": "application/json",
  };
  return types[ext] || "application/octet-stream";
}

async function runStep(job: Job, step: Step, fn: () => Promise<void>) {
  const s = job.steps.find((x) => x.step === step)!;

  if (s.status === "done") {
    addLog(job, `⏭ ${StepLabels[step]} (skipped - already done)`);
    return;
  }

  s.status = "running";
  s.startedAt = Date.now();
  job.currentStep = step;
  addLog(job, `▶ ${StepLabels[step]}`);

  markStepStarted(job.slug, step);
  await convex.reportProgress({ bookPath: job.bookPath, step, status: "running" }).catch((e) => {
    addLog(job, `⚠ Failed to report progress to Convex: ${e.message}`);
  });

  try {
    await fn();
    s.status = "done";
    s.endedAt = Date.now();
    addLog(job, `✔ ${StepLabels[step]} done`);

    markStepComplete(job.slug, step, s.startedAt!, s.endedAt);
    await convex.reportProgress({ bookPath: job.bookPath, step, status: "done" }).catch((e) => {
      addLog(job, `⚠ Failed to report progress to Convex: ${e.message}`);
    });
  } catch (e: unknown) {
    s.status = "error";
    s.endedAt = Date.now();
    const errorMessage = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : String(e);
    const aborted = isAbortError(e);
    if (!aborted || !job.error) {
      job.error = errorMessage;
    }
    if (!aborted) {
      job.status = "error";
      job.currentStep = "failed";
    }
    addLog(
      job,
      `${aborted ? "⚠" : "✖"} ${StepLabels[step]} ${aborted ? "cancelled" : `failed: ${job.error}`}`,
    );
    addLog(job, stack || "");

    markStepError(job.slug, step, errorMessage, s.startedAt!, s.endedAt);
    await convex
      .reportProgress({ bookPath: job.bookPath, step, status: "error", error: errorMessage })
      .catch(() => {});
    if (!aborted) {
      await convex.markFailed({ bookPath: job.bookPath, error: errorMessage }).catch(() => {});
    }

    console.error(`Step ${step} failed:`, e);
    throw e;
  }
}

async function uploadChaptersToConvex(job: Job, tempOutputDir: string) {
  const files = fs
    .readdirSync(tempOutputDir)
    .filter((f) => f.match(/^rewritten-paragraphs-for-chapter-\d+\.xml$/));

  for (const file of files) {
    const match = file.match(/chapter-(\d+)/);
    if (!match) continue;

    const chapterNumber = parseInt(match[1], 10);
    const filePath = path.join(tempOutputDir, file);
    const content = fs.readFileSync(filePath);
    const basename = `chapter-${chapterNumber}.html`;
    const paragraphCount = computeParagraphCount(content.toString("utf-8"));

    addLog(job, `Uploading chapter ${chapterNumber} to Convex...`);

    try {
      await convex.uploadFile({
        folderPath: `${job.bookPath}/chapters-source`,
        basename,
        content,
        contentType: "text/html",
      });
      await convex.updateChapterMetadata({
        bookPath: job.bookPath,
        folderPath: `${job.bookPath}/chapters-source`,
        basename,
        chapterNumber,
        title: `Chapter ${chapterNumber}`,
        paragraphCount,
        sourceFormat: "html",
      });
      addLog(job, `✔ Chapter ${chapterNumber} uploaded`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(job, `⚠ Failed to upload chapter ${chapterNumber}: ${msg}`);
    }
  }
}

async function uploadCharactersToConvex(
  job: Job,
  referenceCards: NewReferenceCardsResponse,
  outputDir: string,
  tempOutputDir: string,
) {
  const generatedPromptsPath = path.join(tempOutputDir, "generated-prompts.json");
  let generatedPrompts: { characters: { name: string; visualGuide: string }[] } = {
    characters: [],
  };
  if (fs.existsSync(generatedPromptsPath)) {
    try {
      generatedPrompts = JSON.parse(fs.readFileSync(generatedPromptsPath, "utf-8"));
      addLog(
        job,
        `Loaded ${generatedPrompts.characters.length} AI prompts from generated-prompts.json`,
      );
    } catch (e) {
      addLog(
        job,
        `⚠ Failed to parse generated-prompts.json: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.log(
    "[uploadCharactersToConvex] Characters to process:",
    referenceCards.characters.map((c) => c.name),
  );

  for (const character of referenceCards.characters) {
    const characterSlug = generateTagName(character.name).toLowerCase();
    console.log(
      `[uploadCharactersToConvex] Processing character: "${character.name}" -> slug: "${characterSlug}"`,
    );
    const promptEntry = generatedPrompts.characters.find(
      (p) => generateTagName(p.name).toLowerCase() === characterSlug,
    );
    const aiPrompt = promptEntry?.visualGuide;

    await convex.ensureCharacterFolder({
      bookPath: job.bookPath,
      characterSlug,
      displayName: character.name,
      summary: character.referenceCard,
      aiPrompt,
    });

    const avatarExtensions = [".png", ".jpg", ".jpeg", ".webp"];
    for (const ext of avatarExtensions) {
      const avatarPath = path.join(outputDir, "characters", `${characterSlug}${ext}`);
      const fileExists = fs.existsSync(avatarPath);
      console.log(
        `[uploadCharactersToConvex] Checking avatar: ${avatarPath} - exists: ${fileExists}`,
      );
      if (fileExists) {
        addLog(job, `Uploading avatar for ${character.name}...`);
        try {
          const content = fs.readFileSync(avatarPath);
          await convex.uploadFile({
            folderPath: `${job.bookPath}/characters/${characterSlug}`,
            basename: `avatar-large${ext}`,
            content,
            contentType: getContentType(avatarPath),
          });
          await convex.markCharacterAvatarState({
            characterPath: `${job.bookPath}/characters/${characterSlug}`,
            state: "ready",
          });
          addLog(job, `✔ Avatar uploaded for ${character.name}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          addLog(job, `⚠ Failed to upload avatar for ${character.name}: ${msg}`);
        }
        break;
      }
    }
  }
}

async function uploadBackgroundsToConvex(job: Job, outputDir: string) {
  const backgroundsDir = path.join(outputDir, "backgrounds");
  if (!fs.existsSync(backgroundsDir)) return;

  const files = fs
    .readdirSync(backgroundsDir)
    .filter((f) => /\.(png|jpg|jpeg|webp|mp4|webm)$/i.test(f));

  for (const file of files) {
    const filePath = path.join(backgroundsDir, file);
    const content = fs.readFileSync(filePath);

    addLog(job, `Uploading background ${file}...`);

    try {
      await convex.uploadFile({
        folderPath: `${job.bookPath}/backgrounds`,
        basename: file,
        content,
        contentType: getContentType(file),
      });

      const match = file.match(/(\d+)-(\d+)/);
      if (match) {
        const chapter = parseInt(match[1], 10);
        const paragraph = parseInt(match[2], 10);
        await convex.upsertBackgroundCue({
          bookPath: job.bookPath,
          chapter,
          paragraph,
          fileBasename: file,
        });
      }

      addLog(job, `✔ Background ${file} uploaded`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(job, `⚠ Failed to upload background ${file}: ${msg}`);
    }
  }
}

// eslint-disable-next-line complexity
async function extractAndUploadNotesToConvex(job: Job, inputDir: string) {
  const richXmlPath = path.join(inputDir, "rich.xml");
  if (!fs.existsSync(richXmlPath)) {
    addLog(job, `⚠ No rich.xml found, skipping notes extraction`);
    return;
  }

  const noteMap = new Map<string, string>();
  const fb2Path = findFb2FilePath(inputDir);
  if (fb2Path) {
    const fb2Content = fs.readFileSync(fb2Path, "utf-8");
    const fb2Doc = parseFb2Xml(fb2Content);
    const notesBody = fb2Doc.querySelector("body[name='notes']");

    if (!notesBody) {
      addLog(job, `No notes section found in FB2`);
    } else {
      const sections = notesBody.querySelectorAll("section");
      for (const section of Array.from(sections)) {
        const id = section.getAttribute("id");
        const normalizedId = id ? normalizeNoteRefId(id) : null;
        const content =
          section
            .querySelector("p")
            ?.innerHTML?.replace(' xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"', "") || "";
        if (normalizedId && content) {
          noteMap.set(normalizedId, content);
        }
      }
    }
  } else {
    addLog(job, `⚠ No FB2 file found, trying Standard Ebooks notes fallback`);
  }

  if (noteMap.size === 0) {
    const seNotesPath = path.join(inputDir, "se-notes.json");
    if (fs.existsSync(seNotesPath)) {
      try {
        const seNotes = JSON.parse(fs.readFileSync(seNotesPath, "utf-8")) as {
          noteId: string;
          content: string;
        }[];
        for (const note of seNotes) {
          const normalizedId = normalizeNoteRefId(note.noteId);
          if (normalizedId && note.content) {
            noteMap.set(normalizedId, note.content);
          }
        }
        if (noteMap.size > 0) {
          addLog(job, `Found ${noteMap.size} notes in se-notes.json`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        addLog(job, `⚠ Failed to parse se-notes.json: ${msg}`);
      }
    }
  }

  if (noteMap.size === 0) {
    addLog(job, `No notes found in available note sources`);
    return;
  }

  const richXml = fs.readFileSync(richXmlPath, "utf-8");
  const notesToUpload = buildNotesToUploadFromNoteMap({ bookPath: job.bookPath, richXml, noteMap });

  if (notesToUpload.length === 0) {
    addLog(job, `No note references found in chapters`);
    return;
  }

  try {
    await convex.uploadNotes({ notes: notesToUpload });
    addLog(job, `✔ Uploaded ${notesToUpload.length} notes to Convex`);

    const usedNoteIds = new Set(notesToUpload.map((n) => n.noteId));
    const orphaned = noteMap.size - usedNoteIds.size;
    if (orphaned > 0) {
      addLog(job, `⚠ ${orphaned} notes not referenced in any chapter`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    addLog(job, `⚠ Failed to upload notes: ${msg}`);
  }
}

async function uploadGraphicalStyleToConvex(job: Job, tempOutputDir: string) {
  const stylePath = path.join(tempOutputDir, "graphicalStyle.json");
  if (!fs.existsSync(stylePath)) return;

  try {
    const styleData = JSON.parse(fs.readFileSync(stylePath, "utf-8"));
    await convex.updateGraphicalStyle({
      bookPath: job.bookPath,
      backgroundStyle: styleData.backgroundStyle,
      periodStyle: styleData.periodStyle,
      avatarStyle: styleData.avatarStyle,
    });
    addLog(job, `✔ Graphical style uploaded to Convex`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    addLog(job, `⚠ Failed to upload graphical style: ${msg}`);
  }
}

async function uploadFiguresToConvex(job: Job, repoRoot: string) {
  const seBookDir = path.join(repoRoot, "standardebooks-data", "books", job.slug);
  const metadataPath = path.join(seBookDir, "metadata.json");
  const imagesDir = path.join(seBookDir, "images");

  if (!fs.existsSync(metadataPath) || !fs.existsSync(imagesDir)) {
    addLog(job, "No Standard Ebooks images detected - skipping figure upload");
    return;
  }

  const files = fs.readdirSync(imagesDir).filter((f) => /\.(png|jpe?g|gif|svg|webp)$/i.test(f));

  if (files.length === 0) {
    addLog(job, `No figure images found in ${imagesDir}`);
    return;
  }

  addLog(job, `Uploading ${files.length} Standard Ebooks figures to Convex...`);

  let uploaded = 0;
  for (const file of files) {
    const filePath = path.join(imagesDir, file);
    try {
      const content = fs.readFileSync(filePath);
      await convex.uploadFile({
        folderPath: `${job.bookPath}/figures`,
        basename: file,
        content,
        contentType: getContentType(file),
      });
      uploaded++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(job, `⚠ Failed to upload figure ${file}: ${msg}`);
    }
  }

  addLog(job, `✔ Figures uploaded: ${uploaded}/${files.length}`);
}

export async function startPipeline(input: {
  epubPath?: string;
  fb2Path?: string;
  slug?: string;
  ebookConvertBin?: string;
  fromStep?: Step;
  completedSteps?: Step[];
}) {
  const {
    epubPath,
    fb2Path,
    slug: providedSlug,
    ebookConvertBin,
    fromStep,
    completedSteps,
  } = input;
  const baseName = epubPath ? path.basename(epubPath, path.extname(epubPath)) : null;
  const slug = providedSlug || slugify(baseName || "book");
  const bookPath = `books/${slug}`;

  initProgress(slug);

  const stepOrder = getStepOrder();
  const fromStepIndex = fromStep ? getStepIndex(fromStep) : -1;
  const completedStepSet = new Set<Step>(completedSteps ?? []);

  const job: Job = {
    id: uuidv4(),
    slug,
    bookPath,
    status: "running",
    currentStep: fromStep || "import_epub",
    activeSteps: [],
    logs: [],
    steps: stepOrder.map((step) => {
      const stepIndex = getStepIndex(step);
      if (completedStepSet.has(step) && step !== fromStep) {
        return { step, status: "done" as const };
      }
      if (fromStepIndex > 0 && stepIndex < fromStepIndex) {
        return { step, status: "done" as const };
      }
      return { step, status: "pending" as const };
    }),
  };
  jobs.set(job.id, job);

  if (fromStep) {
    addLog(job, `Resuming pipeline from step: ${StepLabels[fromStep]}`);
  }

  const repoRoot = getRepoRoot();
  const bookRoot = path.join(repoRoot, "books-data", slug);
  const inputDir = path.join(bookRoot, "input");
  const outputDir = path.join(bookRoot, "output");
  const tempOutputDir = path.join(bookRoot, "temporary-output");

  const schedulerState = createSchedulerState();
  const pipelineAbortController = new AbortController();
  const pipelineSignal = pipelineAbortController.signal;
  for (const step of job.steps) {
    if (step.status === "done") {
      schedulerState.completedSteps.add(step.step);
    }
  }
  let referenceCards: NewReferenceCardsResponse;

  initStyleSelection(bookRoot);
  addLog(job, "Style selection initialized - user can now provide style preference");

  const stepFunctions: Record<string, () => Promise<void>> = {
    import_epub: async () => {
      addLog(job, `Ensuring dirs exist → ${inputDir}, ${outputDir}, ${tempOutputDir}`);
      ensureDir(inputDir);
      ensureDir(outputDir);
      ensureDir(tempOutputDir);
      ensureDir(path.join(outputDir, "characters"));
      ensureDir(path.join(outputDir, "backgrounds"));

      const fb2Target = path.join(inputDir, `${slug}.fb2`);
      const richPath = path.join(inputDir, "rich.xml");

      if (fs.existsSync(richPath)) {
        addLog(job, `Using existing rich.xml at ${richPath}`);
      } else if (epubPath) {
        const bin = ebookConvertBin || process.env.EBOOK_CONVERT_BIN || DEFAULT_EBOOK_CONVERT;
        if (!fs.existsSync(bin)) throw new Error(`ebook-convert not found at ${bin}`);
        addLog(job, `Converting EPUB to FB2 → ${fb2Target}`);
        await runEbookConvert(bin, epubPath, fb2Target);
        if (!fs.existsSync(fb2Target)) throw new Error(`FB2 not created: ${fb2Target}`);
        setBookArg(slug);
        convertBook(slug, 1, 0);
        await extractInlineImages({ slug });
      } else if (fb2Path) {
        const absFb2 = path.isAbsolute(fb2Path) ? fb2Path : path.join(repoRoot, fb2Path);
        if (!fs.existsSync(absFb2)) throw new Error(`FB2 not found: ${absFb2}`);
        addLog(job, `Copying FB2 → ${fb2Target}`);
        fs.copyFileSync(absFb2, fb2Target);
        setBookArg(slug);
        convertBook(slug, 1, 0);
        await extractInlineImages({ slug });
      } else {
        if (!fs.existsSync(fb2Target)) throw new Error(`FB2 missing: ${fb2Target}`);
        setBookArg(slug);
        convertBook(slug, 1, 0);
        await extractInlineImages({ slug });
      }

      await extractAndUploadNotesToConvex(job, inputDir);
    },

    create_settings: async () => {
      setBookArg(slug);
      checkIfBookDataExists();
      createBookSettings();

      const settings = getBookSettings();
      await convex
        .updateBookMetadata({
          bookPath: job.bookPath,
          metadata: { title: settings.title, author: settings.author, language: settings.language },
        })
        .catch((e) => {
          addLog(job, `⚠ Failed to update book metadata: ${e.message}`);
        });
    },

    upload_figures: async () => {
      await uploadFiguresToConvex(job, repoRoot);
    },

    generate_reference_cards: async () => {
      setBookArg(slug);
      const fileName = "single-summary-per-person.json";
      const filePath = getFilePath(fileName, FILE_TYPE.PERMANENT);

      if (fs.existsSync(filePath)) {
        referenceCards = JSON.parse(
          readBookFile(fileName, FILE_TYPE.PERMANENT),
        ) as NewReferenceCardsResponse;
        addLog(job, "Using existing reference cards");
      } else {
        referenceCards = await getReferenceCardsForWholeBook();
        writeBookFile(fileName, JSON.stringify(referenceCards, null, 2), FILE_TYPE.PERMANENT);
      }

      const count = referenceCards.characters?.length;
      if (typeof count === "number") addLog(job, `Generated ${count} reference cards`);

      for (const character of referenceCards.characters) {
        const characterSlug = generateTagName(character.name).toLowerCase();
        await convex
          .ensureCharacterFolder({
            bookPath: job.bookPath,
            characterSlug,
            displayName: character.name,
            summary: character.referenceCard,
          })
          .catch((e) => {
            addLog(job, `⚠ Failed to create character folder for ${character.name}: ${e.message}`);
          });
      }
    },

    rewrite_paragraphs: async () => {
      setBookArg(slug);
      referenceCards = JSON.parse(
        readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT),
      ) as NewReferenceCardsResponse;
      await identifyCharactersAndRewriteParagraphs(referenceCards, pipelineSignal);
      await uploadChaptersToConvex(job, tempOutputDir);
    },

    // eslint-disable-next-line complexity
    generate_graphical_style: async () => {
      setBookArg(slug);

      const seBookDir = path.join(repoRoot, "standardebooks-data/books", slug);
      const seMetadataPath = path.join(seBookDir, "metadata.json");
      const seCoverPath = path.join(seBookDir, "images", "cover.jpg");
      // const isStandardEbook = fs.existsSync(seMetadataPath) && fs.existsSync(seCoverPath);
      const isStandardEbook = true;
      let autoStyle: GraphicalStyle;

      if (isStandardEbook) {
        addLog(job, "Detected Standard Ebook - generating style from cover image");
        const metadata = JSON.parse(fs.readFileSync(seMetadataPath, "utf-8"));
        const coverBuffer = fs.readFileSync(seCoverPath);
        const coverBase64 = coverBuffer.toString("base64");

        const textDir = path.join(seBookDir, "text");
        let bookText = metadata.longDescription || metadata.description || "";
        if (fs.existsSync(textDir)) {
          const textFiles = fs
            .readdirSync(textDir)
            .filter((f: string) => f.endsWith(".xhtml"))
            .slice(0, 2);
          for (const file of textFiles) {
            const content = fs.readFileSync(path.join(textDir, file), "utf-8");
            bookText += "\n" + content.replace(/<[^>]+>/g, " ").substring(0, 2000);
            if (bookText.length > 4000) break;
          }
        }

        autoStyle = await createGraphicalStyleFromCover(
          `${metadata.title} by ${metadata.author}`,
          bookText,
          coverBase64,
          metadata.coverArtist,
          "image/jpeg",
        );
        addLog(job, `Generated style from cover (artist: ${metadata.coverArtist || "unknown"})`);
      } else {
        autoStyle = await createGraphicalStyle(slug, { saveToFile: false });
      }

      const isFreeRun = process.env.FREE_RUN === "true";
      if (isFreeRun) {
        const FREE_RUN_AVATAR_STYLE =
          "Abstract geometric avatar Bauhaus style, simple shapes, limited color palette. Natural look, flat shade.";
        const forcedStyle = { ...autoStyle, avatarStyle: FREE_RUN_AVATAR_STYLE };

        setAutoStyleComplete(bookRoot, forcedStyle);
        setStyleChoice(bookRoot, "auto");

        writeBookFile(
          "graphicalStyle.json",
          JSON.stringify(forcedStyle, null, 2),
          FILE_TYPE.TEMPORARY,
        );
        addLog(job, "FREE_RUN enabled - skipping style selection and previews");

        styleSelectionCallbacks.delete(job.id);
        await uploadGraphicalStyleToConvex(job, tempOutputDir);
        return;
      }

      setAutoStyleComplete(bookRoot, autoStyle);
      addLog(job, "Auto style generated, awaiting user input");

      let userStyle: GraphicalStyle | null = null;

      const userStylePromise = new Promise<GraphicalStyle | null>((resolve) => {
        const existingState = readStyleSelection(bookRoot);
        if (existingState?.userStyle) {
          userStyle = existingState.userStyle;
          resolve(existingState.userStyle);
          return;
        }
        if (existingState?.status === "generating_previews") {
          resolve(existingState.userStyle);
          return;
        }

        styleSelectionCallbacks.set(job.id, {
          onUserStyleSubmitted: (style) => {
            userStyle = style;
            resolve(style);
          },
          onStyleChosen: (_choice) => {},
        });
      });

      await userStylePromise;

      if (userStyle) {
        addLog(job, "Generating previews for both styles");
        const [autoPreview, userPreviewResult] = await Promise.all([
          generateStylePreview(autoStyle, "auto", 1),
          generateStylePreview(userStyle, "user", 1),
        ]);
        setPreviewsGenerated(
          bookRoot,
          autoPreview?.imagePath || null,
          userPreviewResult?.imagePath || null,
          autoPreview?.avatarPath || null,
          userPreviewResult?.avatarPath || null,
        );
        addLog(job, "Previews generated, awaiting style choice");

        await new Promise<void>((resolve) => {
          const currentCallback = styleSelectionCallbacks.get(job.id);
          if (currentCallback) {
            currentCallback.onStyleChosen = () => {
              resolve();
            };
          }

          const checkInterval = setInterval(() => {
            const currentState = readStyleSelection(bookRoot);
            if (currentState?.selected) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 1000);
        });
      } else {
        addLog(job, "No user style provided, generating auto preview only");
        const autoPreview = await generateStylePreview(autoStyle, "auto", 1);
        setPreviewsGenerated(
          bookRoot,
          autoPreview?.imagePath || null,
          null,
          autoPreview?.avatarPath || null,
          null,
        );
        setStyleChoice(bookRoot, "auto");
      }

      styleSelectionCallbacks.delete(job.id);

      const finalState = readStyleSelection(bookRoot);
      const selectedChoice = finalState?.selected || "auto";
      const finalStyle = selectedChoice === "user" && userStyle ? userStyle : autoStyle;
      writeBookFile(
        "graphicalStyle.json",
        JSON.stringify(finalStyle, null, 2),
        FILE_TYPE.TEMPORARY,
      );
      addLog(job, `Final style selected: ${selectedChoice}`);

      await uploadGraphicalStyleToConvex(job, tempOutputDir);
    },

    generate_backgrounds: async () => {
      if (process.env.FREE_RUN === "true") {
        addLog(job, "FREE_RUN enabled - skipping background generation and upload");
        return;
      }
      setBookArg(slug);
      await generateBackgrounds({});
      await uploadBackgroundsToConvex(job, outputDir);
    },

    generate_picture_prompts: async () => {
      setBookArg(slug);
      referenceCards = JSON.parse(
        readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT),
      ) as NewReferenceCardsResponse;
      const prompts = await generatePicturePrompts(referenceCards);
      writeBookFile(
        "generated-prompts.json",
        JSON.stringify(prompts, null, 2),
        FILE_TYPE.TEMPORARY,
      );
      addLog(job, `Generated picture prompts for ${prompts.characters.length} characters`);
    },

    generate_entity_pictures: async () => {
      setBookArg(slug);
      referenceCards = JSON.parse(
        readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT),
      ) as NewReferenceCardsResponse;
      await generatePicturesForEntities(referenceCards);
      await uploadCharactersToConvex(job, referenceCards, outputDir, tempOutputDir);
    },

    map_summaries_to_paragraphs: async () => {
      setBookArg(slug);
      await turnChapterSummariesIntoBulletPointsMappedToParagraphs();
    },

    generate_embeddings: async () => {
      setBookArg(slug);
      const settings = getBookSettings();
      await generateEmbeddings(
        settings.startFromChapter,
        settings.startFromChapter + settings.numberOfChaptersToProcess - 1,
      );
      addLog(
        job,
        `Generated embeddings for chapters ${settings.startFromChapter}-${settings.startFromChapter + settings.numberOfChaptersToProcess - 1}`,
      );
    },

    upload_answer_server_data: async () => {
      const result = await uploadBookFolder(bookRoot, slug);
      if (!result.success) {
        throw new Error(`Failed to upload answer server data: ${result.error}`);
      }
      addLog(job, `Uploaded embeddings and rich.xml to R2 for ${slug}`);
    },
  };

  const runStepParallel = async (step: Step) => {
    const fn = stepFunctions[step];
    if (!fn) {
      addLog(job, `⚠ No function defined for step: ${step}`);
      return;
    }
    await runStep(job, step, fn);
  };

  const run = async () => {
    try {
      process.chdir(repoRoot);
      addLog(job, `cwd -> ${process.cwd()}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(job, `Failed to chdir to repo root: ${msg}`);
    }

    addLog(job, `Initializing book structure in Convex...`);
    try {
      await convex.ensureBookStructure({ jobId: job.id, bookSlug: slug });
      addLog(job, `✔ Book structure created in Convex`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(job, `⚠ Failed to create book structure: ${msg}`);
    }

    const stepsToRun: Step[] = STEP_DEPENDENCIES.map((d) => d.step).filter(
      (step) => step !== "complete" && step !== "failed",
    );

    if (process.env.QUICK_MODE === "true" || process.env.FREE_RUN === "true") {
      const skipSteps: Step[] = [
        "map_summaries_to_paragraphs",
        "generate_embeddings",
        "upload_answer_server_data",
      ];
      for (const skip of skipSteps) {
        schedulerState.completedSteps.add(skip);
        const s = job.steps.find((x) => x.step === skip);
        if (s) s.status = "done";
      }
    }

    const runScheduler = async () => {
      let schedulerError: unknown;

      try {
        while (true) {
          const doneOrFailed =
            schedulerState.completedSteps.size + schedulerState.failedSteps.size >=
            stepsToRun.length;
          if (doneOrFailed) {
            break;
          }

          if (!pipelineSignal.aborted) {
            const readySteps = getReadySteps(
              stepsToRun,
              schedulerState.completedSteps,
              schedulerState.runningSteps,
            );

            if (readySteps.length === 0 && schedulerState.runningSteps.size === 0) {
              throw new Error("Pipeline deadlock: no steps ready and none running");
            }

            for (const step of readySteps) {
              schedulerState.runningSteps.add(step);
              job.activeSteps = Array.from(schedulerState.runningSteps);

              const promise = runStepParallel(step)
                .then(() => {
                  schedulerState.completedSteps.add(step);
                  schedulerState.runningSteps.delete(step);
                  job.activeSteps = Array.from(schedulerState.runningSteps);
                })
                .catch((e) => {
                  schedulerState.failedSteps.add(step);
                  schedulerState.runningSteps.delete(step);
                  job.activeSteps = Array.from(schedulerState.runningSteps);
                  throw e;
                });

              schedulerState.stepPromises.set(step, promise);
            }
          } else if (schedulerState.runningSteps.size === 0) {
            break;
          }

          if (schedulerState.runningSteps.size > 0) {
            const runningPromises = Array.from(schedulerState.runningSteps).map(
              (step) => schedulerState.stepPromises.get(step)!,
            );
            await Promise.race(runningPromises).catch((e) => {
              if (!schedulerError) {
                schedulerError = e;
              }
              pipelineAbortController.abort();
            });
          }
        }
      } finally {
        pipelineAbortController.abort();
        await Promise.allSettled(Array.from(schedulerState.stepPromises.values()));
        job.activeSteps = Array.from(schedulerState.runningSteps);
      }

      if (schedulerError) {
        throw schedulerError;
      }
    };

    await runScheduler();

    job.status = "done";
    job.currentStep = "complete";

    await convex.markCompleted(job.bookPath).catch((e) => {
      addLog(job, `⚠ Failed to mark as completed in Convex: ${e.message}`);
    });

    addLog(job, `✔ Pipeline complete! Book available at ${job.bookPath}`);
  };

  run().catch((e) => {
    const j = jobs.get(job.id);
    if (j) {
      j.status = "error";
      j.currentStep = "failed";
      j.error = e?.message || String(e);
    }
    console.error("Pipeline job failed:", e);
  });

  return job;
}

if (require.main === module) {
  (async () => {
    const slug = process.argv[2] || "test-book";
    const job = await startPipeline({ slug });
    console.log(job);
  })();
}
