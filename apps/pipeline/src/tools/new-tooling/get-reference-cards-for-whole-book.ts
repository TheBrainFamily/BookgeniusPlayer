import fs from "fs";
import path from "path";
import { type Chapter, type NewReferenceCardsResponse } from "../../types";
import { NewReferenceCardsResponseSchema } from "../../schemes";
import { getChaptersUpTo } from "../../helpers/getChaptersUpTo";
import { getBookSettings } from "../../helpers/getBookSettings";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";
import { callGpt5WithSchema } from "../../callGpt5";
import { writeBookFile } from "../../helpers/writeBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { doesBookFileExist, readBookFile } from "../../helpers/readBookFile";
import { getCurrentBookSlug } from "../../helpers/getCurrentBook";
import { generateTagName } from "../../helpers/generateTagName";

type ProviderId = "gpt-5" | "gemini-flash" | "gemini-pro";
type AttemptStatus = "success" | "failure" | "skipped";
type ErrorClass = "retryable_infra" | "non_retryable_provider";

type BenchmarkAttempt = {
  provider: ProviderId;
  status: AttemptStatus;
  durationMs: number;
  errorClass?: ErrorClass;
  errorMessage?: string;
  characterCount?: number;
  selectedAsFinal: boolean;
  sampled: boolean;
};

type ProviderSuccess = {
  provider: ProviderId;
  response: NewReferenceCardsResponse;
  attempt: BenchmarkAttempt;
};
type ProviderAttemptResult = { success?: ProviderSuccess; attempt: BenchmarkAttempt };

type SEChapterMetadataEntry = { number: number; sourceFilenames: string[]; segmentHints: string[] };

type SegmentResult = {
  segmentId: string;
  chapterNumbers: number[];
  characters: NewReferenceCardsResponse["characters"];
};

const SEGMENTED_LARGE_NOVEL_SLUGS = new Set([
  "leo-tolstoy_war-and-peace_louise-maude_aylmer-maude",
  "victor-hugo_les-miserables_isabel-f-hapgood",
  "t-e-lawrence_seven-pillars-of-wisdom",
]);

const SEGMENTED_REFERENCE_CARDS_FILE = "single-summary-per-person-by-segment.json";
const CANONICAL_REFERENCE_CARDS_FILE = "single-summary-per-person-canonical.json";
const CHAPTER_TO_SEGMENT_FILE = "chapter-to-segment-map.json";
const SE_CHAPTER_METADATA_FILE = "se-chapter-metadata.json";

const GENERIC_AVATAR_CARD = {
  name: "generic-avatar",
  referenceCard:
    "A mysterious figure shown from behind or in silhouette. No distinct facial features visible. Enigmatic and anonymous, suitable for representing any unnamed character. Atmospheric lighting with the figure partially obscured by shadow or mist.",
  visualGuide:
    "A mysterious figure shown from behind or in silhouette, with no visible facial features. Anonymous and gender-neutral appearance, softly outlined by atmospheric shadow or mist.",
};

const DEFAULT_PRO_SAMPLE_RATE = 0.1;
const VISUAL_GUIDE_REQUEST_INSTRUCTION = `
## Additional Required Field

For every character, include \`visualGuide\`:
- One short paragraph focused only on physical appearance, possibly including their job, role, ethnicity, age, build, hair, eyes, facial features, distinctive marks (scars, tattoos), clothing, and accessories _if_ they are characteristic or commonly worn. 
- No spoilers, no relationships, no plot details.
- If details are sparse, infer plausible visible traits from context (age range, styling, clothing, look, sex, ethnicity, etc.). Do not say: "not described", just output the best guess.
- Exaggerate unique visual traits mentioned in the text to make characters distinct. Images based on the decription will be used as a memory jog for users. Especially if there is many similar people we should make them distinct. 
- Lets say there is 5 soldiers that have no unique features described, imagine some elements. Don't create basically the same visualGuide for all of them.
`;

function buildRunId(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${iso}-${random}`;
}

function parseSampleRate(raw: string | undefined): number {
  const parsed = Number.parseFloat(raw || `${DEFAULT_PRO_SAMPLE_RATE}`);
  if (Number.isNaN(parsed)) {
    return DEFAULT_PRO_SAMPLE_RATE;
  }
  return Math.max(0, Math.min(1, parsed));
}

function classifyProviderError(error: unknown): ErrorClass {
  const candidate = (error || {}) as { status?: number; statusCode?: number; message?: string };
  const status = candidate.statusCode ?? candidate.status;
  const message = (candidate.message || "").toLowerCase();
  const isRetryable =
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted") ||
    message.includes("quota exceeded") ||
    message.includes("too many requests") ||
    message.includes("gateway") ||
    message.includes("service unavailable") ||
    message.includes("timeout") ||
    message.includes("fetch failed");

  return isRetryable ? "retryable_infra" : "non_retryable_provider";
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown error";
  }
}

function appendGenericAvatarIfMissing(
  response: NewReferenceCardsResponse,
): NewReferenceCardsResponse {
  const cloned = JSON.parse(JSON.stringify(response)) as NewReferenceCardsResponse;
  if (!cloned.characters.some((character) => character.name === "generic-avatar")) {
    cloned.characters.push(GENERIC_AVATAR_CARD);
  }
  return cloned;
}

function buildBenchmarkRoot(): string {
  const runId = process.env.REFERENCE_CARDS_BENCHMARK_RUN_ID || buildRunId();
  return `reference-cards-benchmarks/${runId}`;
}

function buildNameSet(response: NewReferenceCardsResponse): string[] {
  const names = new Set(
    response.characters.map((character) => character.name.trim().toLowerCase()),
  );
  return Array.from(names).sort();
}

function dedupeCharactersBySlug(
  characters: NewReferenceCardsResponse["characters"],
): NewReferenceCardsResponse["characters"] {
  const bySlug = new Map<string, NewReferenceCardsResponse["characters"][number]>();
  for (const character of characters) {
    const name = character.name.trim();
    if (!name) continue;
    const slug = generateTagName(name).toLowerCase();
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, {
      ...character,
      name,
      referenceCard: character.referenceCard.trim(),
      visualGuide: character.visualGuide.trim(),
    });
  }
  return Array.from(bySlug.values());
}

function parseBookNumberFromWarAndPeaceFilename(fileName: string): string | null {
  const match = fileName.match(/^chapter-(\d+)-\d+-\d+\.xhtml$/);
  return match ? `book-${match[1]}` : null;
}

function parseBookNumberFromWarAndPeaceHint(hint: string): string | null {
  const partMatch = hint.match(/^part-(\d+)-\d+$/);
  if (partMatch) return `book-${partMatch[1]}`;
  const bookMatch = hint.match(/^book-(\d+)$/);
  return bookMatch ? `book-${bookMatch[1]}` : null;
}

function parseBookNumberFromLesMisFilename(fileName: string): string | null {
  const match = fileName.match(/^chapter-(\d+)-(\d+)-\d+\.xhtml$/);
  return match ? `book-${match[1]}-${match[2]}` : null;
}

function parseBookNumberFromLesMisHint(hint: string): string | null {
  const match = hint.match(/^book-(\d+)-(\d+)$/);
  return match ? `book-${match[1]}-${match[2]}` : null;
}

function parseBookNumberFromSevenPillarsHint(hint: string): string | null {
  const match = hint.match(/^book-(\d+)$/);
  return match ? `book-${match[1]}` : null;
}

function deriveSegmentIdForChapter(
  slug: string,
  metadata: SEChapterMetadataEntry | undefined,
): string | null {
  if (!metadata) return null;

  const fileNames = metadata.sourceFilenames || [];
  const hints = metadata.segmentHints || [];

  if (slug === "leo-tolstoy_war-and-peace_louise-maude_aylmer-maude") {
    for (const fileName of fileNames) {
      const parsed = parseBookNumberFromWarAndPeaceFilename(fileName);
      if (parsed) return parsed;
    }
    for (const hint of hints) {
      const parsed = parseBookNumberFromWarAndPeaceHint(hint);
      if (parsed) return parsed;
    }
    return null;
  }

  if (slug === "victor-hugo_les-miserables_isabel-f-hapgood") {
    for (const fileName of fileNames) {
      const parsed = parseBookNumberFromLesMisFilename(fileName);
      if (parsed) return parsed;
    }
    for (const hint of hints) {
      const parsed = parseBookNumberFromLesMisHint(hint);
      if (parsed) return parsed;
    }
    return null;
  }

  if (slug === "t-e-lawrence_seven-pillars-of-wisdom") {
    for (const hint of hints) {
      const parsed = parseBookNumberFromSevenPillarsHint(hint);
      if (parsed) return parsed;
    }
    for (const fileName of fileNames) {
      const match = fileName.match(/^book-(\d+)\.xhtml$/);
      if (match) return `book-${match[1]}`;
    }
    return null;
  }

  return null;
}

function resolveMissingSegmentIds(segmentIds: Array<string | null>): string[] {
  const resolved = [...segmentIds];

  let lastKnown: string | null = null;
  for (let i = 0; i < resolved.length; i++) {
    if (resolved[i]) {
      lastKnown = resolved[i];
      continue;
    }
    if (lastKnown) {
      resolved[i] = lastKnown;
    }
  }

  let nextKnown: string | null = null;
  for (let i = resolved.length - 1; i >= 0; i--) {
    if (resolved[i]) {
      nextKnown = resolved[i];
      continue;
    }
    if (nextKnown) {
      resolved[i] = nextKnown;
    }
  }

  return resolved.map((segmentId) => segmentId || "book-1");
}

function buildSegmentPlan(
  slug: string,
  chapters: Chapter[],
  chapterMetadata: SEChapterMetadataEntry[],
): {
  chapterToSegment: Record<number, string>;
  segments: Array<{ segmentId: string; chapters: Chapter[] }>;
} {
  const byChapterNumber = new Map<number, SEChapterMetadataEntry>();
  for (const entry of chapterMetadata) {
    byChapterNumber.set(entry.number, entry);
  }

  const provisionalSegmentIds = chapters.map((chapter) =>
    deriveSegmentIdForChapter(slug, byChapterNumber.get(chapter.number)),
  );
  const resolvedSegmentIds = resolveMissingSegmentIds(provisionalSegmentIds);

  const chapterToSegment: Record<number, string> = {};
  const segments: Array<{ segmentId: string; chapters: Chapter[] }> = [];
  const segmentIndexById = new Map<string, number>();

  chapters.forEach((chapter, index) => {
    const segmentId = resolvedSegmentIds[index];
    chapterToSegment[chapter.number] = segmentId;

    const existingIndex = segmentIndexById.get(segmentId);
    if (existingIndex === undefined) {
      segmentIndexById.set(segmentId, segments.length);
      segments.push({ segmentId, chapters: [chapter] });
      return;
    }

    segments[existingIndex].chapters.push(chapter);
  });

  return { chapterToSegment, segments };
}

function buildPromptForChapters(
  filteredChapters: Chapter[],
  knownCharacters: Array<{ name: string; summary: string }>,
): string {
  const filteredXml = `<chapters>
${filteredChapters
  .map(
    (chapter) =>
      `<chapter number="${chapter.number}"><title>${chapter.title}</title><content>${chapter.content}</content></chapter>`,
  )
  .join("\n")}
</chapters>`;

  const knownCharactersMapped = knownCharacters
    .map((character) => `<character name="${character.name}" summary="${character.summary}" />`)
    .join("\n");
  const prompt = fs.readFileSync(path.join(__dirname, "./single-summary-per-person.md"), "utf8");
  const knownCharactersPrompt =
    knownCharactersMapped.length > 0
      ? `## Known Characters
### Notes

- Be consistent with character names.
- Use the known character names and summaries for the already known characters from previous book segments in this novel.
- Return only characters that appear or are mentioned in the current chapter set.

### List of known characters from previous book segments

${knownCharactersMapped}\n\n`
      : "";

  return `${prompt}${knownCharactersPrompt}\n\n${VISUAL_GUIDE_REQUEST_INSTRUCTION}\n\n## Book Text \n\n${filteredXml}`;
}

async function callProviderWithCapture(
  provider: ProviderId,
  sampled: boolean,
  call: () => Promise<unknown>,
): Promise<ProviderAttemptResult> {
  const startedAt = Date.now();
  try {
    const response = NewReferenceCardsResponseSchema.parse(await call());
    const attempt: BenchmarkAttempt = {
      provider,
      status: "success",
      durationMs: Date.now() - startedAt,
      characterCount: response.characters.length,
      selectedAsFinal: false,
      sampled,
    };
    return { success: { provider, response, attempt }, attempt };
  } catch (error) {
    return {
      attempt: {
        provider,
        status: "failure",
        durationMs: Date.now() - startedAt,
        errorClass: classifyProviderError(error),
        errorMessage: sanitizeErrorMessage(error),
        selectedAsFinal: false,
        sampled,
      },
    };
  }
}

function getSummary(attempts: BenchmarkAttempt[], selectedProvider: ProviderId | null) {
  const byProvider = attempts.reduce<
    Record<ProviderId, { success: number; failure: number; skipped: number }>
  >(
    (acc, attempt) => {
      acc[attempt.provider][attempt.status] += 1;
      return acc;
    },
    {
      "gpt-5": { success: 0, failure: 0, skipped: 0 },
      "gemini-flash": { success: 0, failure: 0, skipped: 0 },
      "gemini-pro": { success: 0, failure: 0, skipped: 0 },
    },
  );

  return {
    attempts: attempts.length,
    selectedProvider,
    sampledGeminiPro: attempts.some(
      (attempt) => attempt.provider === "gemini-pro" && attempt.sampled,
    ),
    providers: byProvider,
    generatedAt: new Date().toISOString(),
  };
}

function buildCombinedPrompt(): string {
  const booksSettings = getBookSettings();
  const filteredChapters = getChaptersUpTo(
    booksSettings.startFromChapter,
    booksSettings.startFromChapter + booksSettings.numberOfChaptersToProcess,
  );

  console.log(`Filtered ${filteredChapters.length} chapters`);
  const combinedPrompt = buildPromptForChapters(filteredChapters, []);
  console.log("combinedPrompt length:", combinedPrompt.length);
  return combinedPrompt;
}

function buildProviderTasks(combinedPrompt: string, shouldSampleGeminiPro: boolean) {
  const gptTask = callProviderWithCapture("gpt-5", true, () =>
    callGpt5WithSchema(combinedPrompt, NewReferenceCardsResponseSchema),
  );
  const geminiFlashTask = callProviderWithCapture("gemini-flash", true, () =>
    callGeminiWithThinkingAndSchemaAndParsed(
      combinedPrompt,
      NewReferenceCardsResponseSchema,
      "gemini-3-flash-preview",
    ),
  );
  const geminiProTask = shouldSampleGeminiPro
    ? callProviderWithCapture("gemini-pro", true, () =>
        callGeminiWithThinkingAndSchemaAndParsed(
          combinedPrompt,
          NewReferenceCardsResponseSchema,
          "gemini-3-pro-preview",
        ),
      )
    : Promise.resolve({
        attempt: {
          provider: "gemini-pro" as const,
          status: "skipped" as const,
          durationMs: 0,
          selectedAsFinal: false,
          sampled: false,
        },
      });

  return [gptTask, geminiFlashTask, geminiProTask] as const;
}

function normalizeProviderResults(
  settled: PromiseSettledResult<ProviderAttemptResult>[],
  shouldSampleGeminiPro: boolean,
): ProviderAttemptResult[] {
  return settled.map((entry, index) => {
    if (entry.status === "fulfilled") {
      return entry.value;
    }

    const provider: ProviderId =
      index === 0 ? "gpt-5" : index === 1 ? "gemini-flash" : "gemini-pro";
    return {
      attempt: {
        provider,
        status: "failure",
        durationMs: 0,
        errorClass: classifyProviderError(entry.reason),
        errorMessage: sanitizeErrorMessage(entry.reason),
        selectedAsFinal: false,
        sampled: provider === "gemini-pro" ? shouldSampleGeminiPro : true,
      },
    };
  });
}

function markSelectedAttempt(
  gptResult: ProviderAttemptResult,
  geminiFlashResult: ProviderAttemptResult,
): void {
  if (gptResult.success) {
    gptResult.success.attempt.selectedAsFinal = true;
    return;
  }
  if (geminiFlashResult.success) {
    geminiFlashResult.success.attempt.selectedAsFinal = true;
  }
}

function writeProviderOutputs(
  benchmarkRoot: string,
  gptResult: ProviderAttemptResult,
  geminiFlashResult: ProviderAttemptResult,
  geminiProResult: ProviderAttemptResult,
): void {
  if (gptResult.success) {
    writeBookFile(
      `${benchmarkRoot}/outputs/gpt-5.json`,
      JSON.stringify(gptResult.success.response, null, 2),
    );
  }

  if (geminiFlashResult.success) {
    writeBookFile(
      `${benchmarkRoot}/outputs/gemini-flash.json`,
      JSON.stringify(geminiFlashResult.success.response, null, 2),
    );
  }

  if (geminiProResult.success) {
    writeBookFile(
      `${benchmarkRoot}/outputs/gemini-pro.json`,
      JSON.stringify(geminiProResult.success.response, null, 2),
    );
  }
}

function writeDiffs(
  benchmarkRoot: string,
  shouldSampleGeminiPro: boolean,
  gptResult: ProviderAttemptResult,
  geminiFlashResult: ProviderAttemptResult,
  geminiProResult: ProviderAttemptResult,
): void {
  if (gptResult.success && geminiFlashResult.success) {
    const diff = {
      gptCount: gptResult.success.response.characters.length,
      geminiFlashCount: geminiFlashResult.success.response.characters.length,
      gptNames: buildNameSet(gptResult.success.response),
      geminiFlashNames: buildNameSet(geminiFlashResult.success.response),
    };
    writeBookFile(
      `${benchmarkRoot}/diffs/gpt-5-vs-gemini-flash.json`,
      JSON.stringify(diff, null, 2),
    );
  }

  if (shouldSampleGeminiPro && geminiProResult.success && gptResult.success) {
    const diff = {
      gptCount: gptResult.success.response.characters.length,
      geminiProCount: geminiProResult.success.response.characters.length,
      gptNames: buildNameSet(gptResult.success.response),
      geminiProNames: buildNameSet(geminiProResult.success.response),
    };
    writeBookFile(`${benchmarkRoot}/diffs/gpt-5-vs-gemini-pro.json`, JSON.stringify(diff, null, 2));
  }
}

function selectFinalProvider(
  gptResult: ProviderAttemptResult,
  geminiFlashResult: ProviderAttemptResult,
): { selectedRaw: NewReferenceCardsResponse | undefined; selectedProvider: ProviderId | null } {
  if (gptResult.success) {
    return { selectedRaw: gptResult.success.response, selectedProvider: "gpt-5" };
  }
  if (geminiFlashResult.success) {
    return { selectedRaw: geminiFlashResult.success.response, selectedProvider: "gemini-flash" };
  }
  return { selectedRaw: undefined, selectedProvider: null };
}

async function runProviderSelectionForPrompt(
  combinedPrompt: string,
  benchmarkRoot: string,
): Promise<NewReferenceCardsResponse> {
  writeBookFile(`${benchmarkRoot}/prompt.md`, combinedPrompt);

  const sampleRate = parseSampleRate(process.env.REFERENCE_CARDS_GEMINI_PRO_SAMPLE_RATE);
  const shouldSampleGeminiPro = Math.random() < sampleRate;
  const [gptTask, geminiFlashTask, geminiProTask] = buildProviderTasks(
    combinedPrompt,
    shouldSampleGeminiPro,
  );
  const settled = await Promise.allSettled([gptTask, geminiFlashTask, geminiProTask]);
  const results = normalizeProviderResults(settled, shouldSampleGeminiPro);

  const gptResult = results[0];
  const geminiFlashResult = results[1];
  const geminiProResult = results[2];
  const attempts: BenchmarkAttempt[] = results.map((result) => result.attempt);

  markSelectedAttempt(gptResult, geminiFlashResult);
  writeProviderOutputs(benchmarkRoot, gptResult, geminiFlashResult, geminiProResult);
  writeDiffs(benchmarkRoot, shouldSampleGeminiPro, gptResult, geminiFlashResult, geminiProResult);
  const { selectedRaw, selectedProvider } = selectFinalProvider(gptResult, geminiFlashResult);

  writeBookFile(
    `${benchmarkRoot}/manifest.ndjson`,
    `${attempts.map((attempt) => JSON.stringify(attempt)).join("\n")}\n`,
  );
  writeBookFile(
    `${benchmarkRoot}/summary.json`,
    JSON.stringify(getSummary(attempts, selectedProvider), null, 2),
  );

  if (!selectedRaw || !selectedProvider) {
    const gptError = gptResult.attempt.errorMessage || "unknown";
    const geminiError = geminiFlashResult.attempt.errorMessage || "unknown";
    throw new Error(`Reference cards failed. GPT-5: ${gptError}; Gemini Flash: ${geminiError}`);
  }

  const selected = appendGenericAvatarIfMissing(selectedRaw);
  writeBookFile(`${benchmarkRoot}/outputs/selected.json`, JSON.stringify(selected, null, 2));
  return selected;
}

function normalizeSegmentFileToken(segmentId: string): string {
  return segmentId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripGenericAvatar(
  characters: NewReferenceCardsResponse["characters"],
): NewReferenceCardsResponse["characters"] {
  return characters.filter((character) => character.name.trim().toLowerCase() !== "generic-avatar");
}

async function runSegmentedReferenceCards(
  slug: string,
  benchmarkRoot: string,
): Promise<NewReferenceCardsResponse> {
  if (!doesBookFileExist(SE_CHAPTER_METADATA_FILE, FILE_TYPE.INPUT)) {
    throw new Error(
      `Missing ${SE_CHAPTER_METADATA_FILE} for segmented large novel flow (${slug}). Re-run SE conversion.`,
    );
  }

  const chapterMetadata = JSON.parse(
    readBookFile(SE_CHAPTER_METADATA_FILE, FILE_TYPE.INPUT),
  ) as SEChapterMetadataEntry[];
  const booksSettings = getBookSettings();
  const chapters = getChaptersUpTo(
    booksSettings.startFromChapter,
    booksSettings.startFromChapter + booksSettings.numberOfChaptersToProcess,
  );

  const { chapterToSegment, segments } = buildSegmentPlan(slug, chapters, chapterMetadata);

  const knownBySlug = new Map<string, { name: string; summary: string }>();
  const canonicalBySlug = new Map<
    string,
    { character: NewReferenceCardsResponse["characters"][number]; firstSegmentId: string }
  >();
  const segmentResults: SegmentResult[] = [];

  for (const segment of segments) {
    const knownCharacters = Array.from(knownBySlug.values());
    const segmentPrompt = buildPromptForChapters(segment.chapters, knownCharacters);
    const segmentToken = normalizeSegmentFileToken(segment.segmentId) || "segment";

    writeBookFile(
      `get-reference-cards-for-whole-book-prompt-${segmentToken}.md`,
      segmentPrompt,
      FILE_TYPE.TEMPORARY,
    );

    const segmentResponse = await runProviderSelectionForPrompt(
      segmentPrompt,
      `${benchmarkRoot}/segments/${segmentToken}`,
    );
    const dedupedSegmentCharacters = dedupeCharactersBySlug(
      stripGenericAvatar(segmentResponse.characters),
    );

    segmentResults.push({
      segmentId: segment.segmentId,
      chapterNumbers: segment.chapters.map((chapter) => chapter.number),
      characters: dedupedSegmentCharacters,
    });

    for (const character of dedupedSegmentCharacters) {
      const characterSlug = generateTagName(character.name).toLowerCase();
      if (!knownBySlug.has(characterSlug)) {
        knownBySlug.set(characterSlug, { name: character.name, summary: character.referenceCard });
      }
      if (!canonicalBySlug.has(characterSlug)) {
        canonicalBySlug.set(characterSlug, { character, firstSegmentId: segment.segmentId });
      }
    }
  }

  const canonicalCharacters = appendGenericAvatarIfMissing({
    characters: Array.from(canonicalBySlug.values()).map((entry) => entry.character),
  });

  const chapterToSegmentForFile = Object.fromEntries(
    Object.entries(chapterToSegment).map(([key, value]) => [String(key), value]),
  );

  writeBookFile(
    SEGMENTED_REFERENCE_CARDS_FILE,
    JSON.stringify(
      {
        mode: "hardcoded-book-segments-v1",
        slug,
        segments: segmentResults,
        chapterToSegment: chapterToSegmentForFile,
      },
      null,
      2,
    ),
    FILE_TYPE.PERMANENT,
  );

  writeBookFile(
    CHAPTER_TO_SEGMENT_FILE,
    JSON.stringify(chapterToSegmentForFile, null, 2),
    FILE_TYPE.PERMANENT,
  );

  writeBookFile(
    CANONICAL_REFERENCE_CARDS_FILE,
    JSON.stringify(canonicalCharacters, null, 2),
    FILE_TYPE.PERMANENT,
  );

  writeBookFile(
    `${benchmarkRoot}/summary.json`,
    JSON.stringify(
      {
        mode: "hardcoded-book-segments-v1",
        slug,
        segmentCount: segmentResults.length,
        segments: segmentResults.map((segment) => ({
          segmentId: segment.segmentId,
          chapters: segment.chapterNumbers.length,
          characters: segment.characters.length,
        })),
      },
      null,
      2,
    ),
  );
  writeBookFile(
    `${benchmarkRoot}/outputs/selected.json`,
    JSON.stringify(canonicalCharacters, null, 2),
  );

  return canonicalCharacters;
}

export const getReferenceCardsForWholeBook = async (): Promise<NewReferenceCardsResponse> => {
  const currentSlug = getCurrentBookSlug();
  const benchmarkRoot = buildBenchmarkRoot();
  if (SEGMENTED_LARGE_NOVEL_SLUGS.has(currentSlug)) {
    return await runSegmentedReferenceCards(currentSlug, benchmarkRoot);
  }

  const combinedPrompt = buildCombinedPrompt();
  writeBookFile("get-reference-cards-for-whole-book-prompt.md", combinedPrompt);
  return await runProviderSelectionForPrompt(combinedPrompt, benchmarkRoot);
};

if (require.main === module) {
  const doIt = async () => {
    getReferenceCardsForWholeBook().then((response) => {
      console.log(response);
    });
  };
  doIt();
}
