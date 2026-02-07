import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewReferenceCardsResponse } from "../types";
import type { ChapterChunk, Paragraph } from "./chapterChunker";

const testState = vi.hoisted(() => {
  type WriteCall = { fileName: string; content: string; fileType?: string };
  type ProviderCall = { chapter: number; chunk: number; prompt: string };

  const fileStore = new Map<string, string>();
  const writeCalls: WriteCall[] = [];
  const providerCalls: ProviderCall[] = [];
  const chapterChunkCounts = new Map<number, number>();

  let chapterStart = 1;
  let chapterCount = 1;

  let blockedKey: string | null = null;
  let blockedResolver: ((value: string) => void) | null = null;

  function reset() {
    fileStore.clear();
    writeCalls.length = 0;
    providerCalls.length = 0;
    chapterChunkCounts.clear();
    chapterStart = 1;
    chapterCount = 1;
    blockedKey = null;
    blockedResolver = null;
  }

  function configureChapters(startFromChapter: number, numberOfChaptersToProcess: number): void {
    chapterStart = startFromChapter;
    chapterCount = numberOfChaptersToProcess;
  }

  function setChunkCounts(entries: Array<[number, number]>): void {
    chapterChunkCounts.clear();
    for (const [chapter, count] of entries) {
      chapterChunkCounts.set(chapter, count);
    }
  }

  function blockProviderFor(chapter: number, chunk: number): void {
    blockedKey = `${chapter}-${chunk}`;
    blockedResolver = null;
  }

  function resolveBlockedProvider(value: string): void {
    if (!blockedResolver) {
      throw new Error("No blocked provider call is waiting");
    }
    blockedResolver(value);
    blockedResolver = null;
    blockedKey = null;
  }

  function getChunkCount(chapter: number): number {
    return chapterChunkCounts.get(chapter) ?? 1;
  }

  function parseCurrentChunkFromPrompt(prompt: string): { chapter: number; chunk: number } {
    const marker = "### Text Content";
    const markerIndex = prompt.indexOf(marker);
    const searchArea = markerIndex >= 0 ? prompt.slice(markerIndex) : prompt;
    const match = searchArea.match(/C(\d+)-K(\d+)/);

    if (!match) {
      throw new Error(`Could not parse chapter/chunk from prompt: ${prompt.slice(0, 200)}`);
    }

    return { chapter: Number.parseInt(match[1], 10), chunk: Number.parseInt(match[2], 10) };
  }

  async function callProvider(prompt: string): Promise<string> {
    const { chapter, chunk } = parseCurrentChunkFromPrompt(prompt);
    providerCalls.push({ chapter, chunk, prompt });

    const currentKey = `${chapter}-${chunk}`;
    if (blockedKey === currentKey) {
      return new Promise<string>((resolve) => {
        blockedResolver = resolve;
      });
    }

    return `<p>R-C${chapter}-K${chunk}</p>`;
  }

  function buildChunks(chapter: number): ChapterChunk[] {
    const count = getChunkCount(chapter);

    return Array.from({ length: count }, (_, chunkIndex) => {
      const paragraph: Paragraph = {
        text: `C${chapter}-K${chunkIndex}`,
        dataIndex: chunkIndex,
        elementType: "p",
      };

      return { chunkIndex, totalChunks: count, paragraphs: [paragraph], tokenCount: 100 };
    });
  }

  return {
    fileStore,
    writeCalls,
    providerCalls,
    reset,
    configureChapters,
    setChunkCounts,
    blockProviderFor,
    resolveBlockedProvider,
    getChunkCount,
    callProvider,
    buildChunks,
    get chapterStart() {
      return chapterStart;
    },
    get chapterCount() {
      return chapterCount;
    },
  };
});

vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn(() =>
      [
        "{{previousContextSection}}",
        "### Text Content",
        "{{paragraphs_html}}",
        "{{outputOnlyInstruction}}",
        "### Characters",
        "{{characters_json}}",
      ].join("\n"),
    ),
  },
}));

vi.mock("../logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

vi.mock("../helpers/getBookSettings", () => ({
  getBookSettings: vi.fn(() => ({
    startFromChapter: testState.chapterStart,
    numberOfChaptersToProcess: testState.chapterCount,
  })),
}));

vi.mock("./createParagraphsWithPageNumbers", () => ({
  getChapterParagraphsAndSectionAttributes: vi.fn((chapter: number) => ({
    paragraphs: [{ text: `chapter-${chapter}-seed`, dataIndex: chapter, elementType: "p" }],
    sectionAttributes: { "data-origin": `chapter-${chapter}` },
  })),
}));

vi.mock("./getChapterFormat", () => ({ getChapterFormat: vi.fn(() => "prose") }));

vi.mock("../helpers/generateTagName", () => ({
  generateTagName: vi.fn((name: string) => name.toLowerCase().replace(/\s+/g, "-")),
}));

vi.mock("../helpers/writeBookFile", () => ({
  writeBookFile: vi.fn((fileName: string, content: string, fileType?: string) => {
    testState.fileStore.set(fileName, content);
    testState.writeCalls.push({ fileName, content, fileType });
  }),
}));

vi.mock("../helpers/readBookFile", () => ({
  readBookFile: vi.fn((fileName: string) => {
    const content = testState.fileStore.get(fileName);
    if (content === undefined) {
      throw new Error(`File not found in test store: ${fileName}`);
    }
    return content;
  }),
  doesBookFileExist: vi.fn((fileName: string) => testState.fileStore.has(fileName)),
}));

vi.mock("./new-tooling/compare-chapters-xml", () => ({ compareXmlTextContent: vi.fn(() => true) }));

vi.mock("./new-tooling/restore-text-in-html", () => ({
  restoreOriginalTextInHtml: vi.fn((_original: string, rewritten: string) => rewritten),
}));

vi.mock("./new-tooling/restore-unwrapped-lines", () => ({
  restoreUnwrappedLines: vi.fn((_original: string, rewritten: string) => rewritten),
}));

vi.mock("./new-tooling/sanitize-nested-paragraphs", () => ({
  sanitizeNestedParagraphs: vi.fn((rewritten: string) => rewritten),
}));

vi.mock("../helpers/abortHelpers", () => ({
  abortableSleep: vi.fn(async () => undefined),
  checkAborted: vi.fn(() => undefined),
  isAbortError: vi.fn(() => false),
}));

vi.mock("./chapterChunker", () => ({
  needsChunking: vi.fn(() => true),
  chunkParagraphs: vi.fn((paragraphs: Paragraph[]) => {
    const chapter = Number.parseInt(paragraphs[0].text.replace("chapter-", "").split("-")[0], 10);
    return testState.buildChunks(chapter);
  }),
  buildChunkXml: vi.fn((paragraphs: Paragraph[]) =>
    paragraphs.map((p) => `<${p.elementType}>${p.text}</${p.elementType}>`).join("\n"),
  ),
  buildParagraphXml: vi.fn(
    (paragraph: Paragraph) =>
      `<${paragraph.elementType}>${paragraph.text}</${paragraph.elementType}>`,
  ),
  combineChunks: vi.fn(
    (chapterId: number, chunkOutputs: string[], sectionAttributes?: Record<string, string>) =>
      `<section data-chapter="${chapterId}" data-origin="${sectionAttributes?.["data-origin"]}">\n${chunkOutputs.join("\n")}\n</section>`,
  ),
}));

vi.mock("../callClaude", () => ({
  callGeminiWrapper: vi.fn((prompt: string) => testState.callProvider(prompt)),
  callGeminiVertexWrapper: vi.fn((prompt: string) => testState.callProvider(prompt)),
}));

vi.mock("../callGrok", () => ({
  callGrok: vi.fn((prompt: string) => testState.callProvider(prompt)),
}));

vi.mock("../callO3", () => ({
  callGpt5: vi.fn((prompt: string) => testState.callProvider(prompt)),
}));

import { identifyCharactersAndRewriteParagraphs } from "./identifyEntityAndRewriteParagraphs";

function createReferenceCards(): NewReferenceCardsResponse {
  return {
    characters: [
      { name: "Alice", referenceCard: "Main character" },
      { name: "generic-avatar", referenceCard: "Synthetic" },
    ],
  } as NewReferenceCardsResponse;
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000, intervalMs = 10): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe("identifyCharactersAndRewriteParagraphs chunk scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.reset();
  });

  it("allows a chapter to continue to later chunks without waiting for another chapter's chunk 1", async () => {
    testState.configureChapters(1, 2);
    testState.setChunkCounts([
      [1, 3],
      [2, 2],
    ]);
    testState.blockProviderFor(2, 1);

    const runPromise = identifyCharactersAndRewriteParagraphs(createReferenceCards());

    await waitFor(() =>
      testState.providerCalls.some((call) => call.chapter === 2 && call.chunk === 1),
    );

    await waitFor(() =>
      testState.providerCalls.some((call) => call.chapter === 1 && call.chunk === 2),
    );

    testState.resolveBlockedProvider("<p>R-C2-K1</p>");
    await runPromise;

    const chapter1Output = testState.fileStore.get("rewritten-paragraphs-for-chapter-1.xml");
    const chapter2Output = testState.fileStore.get("rewritten-paragraphs-for-chapter-2.xml");

    expect(chapter1Output).toContain("R-C1-K2");
    expect(chapter2Output).toContain("R-C2-K1");
  });

  it("uses rewritten previous chunk context for chunk 1 and chunk 2", async () => {
    testState.configureChapters(1, 1);
    testState.setChunkCounts([[1, 3]]);

    await identifyCharactersAndRewriteParagraphs(createReferenceCards());

    const chunk1Prompt = testState.providerCalls.find(
      (call) => call.chapter === 1 && call.chunk === 1,
    );
    const chunk2Prompt = testState.providerCalls.find(
      (call) => call.chapter === 1 && call.chunk === 2,
    );
    const compiledChunk2PromptWrite = testState.writeCalls.find(
      (call) => call.fileName === "compiled-prompt-for-chapter-1-chunk-2.md",
    );

    expect(chunk1Prompt).toBeDefined();
    expect(chunk2Prompt).toBeDefined();
    expect(chunk1Prompt?.prompt).toContain("<PreviousContext>\n<p>R-C1-K0</p>\n</PreviousContext>");
    expect(chunk2Prompt?.prompt).toContain("<PreviousContext>\n<p>R-C1-K1</p>\n</PreviousContext>");
    expect(compiledChunk2PromptWrite?.content).toContain("<p>R-C1-K1</p>");
  });
});
