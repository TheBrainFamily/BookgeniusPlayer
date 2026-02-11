import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewReferenceCardsResponse } from "../types";
import type { ChapterChunk, Paragraph } from "./chapterChunker";
import * as chapterChunker from "./chapterChunker";

process.env.REWRITE_BENCHMARK_RUN_ID = "identify-spec-run";

const testState = vi.hoisted(() => {
  type WriteCall = { fileName: string; content: string; fileType?: string };
  type ProviderCall = { chapter: number; chunk: number; prompt: string };

  const fileStore = new Map<string, string>();
  const writeCalls: WriteCall[] = [];
  const providerCalls: ProviderCall[] = [];
  const chapterChunkCounts = new Map<number, number>();
  const providerResponses = new Map<string, Array<string | Error>>();

  let chapterStart = 1;
  let chapterCount = 1;

  let blockedKey: string | null = null;
  let blockedResolver: ((value: string) => void) | null = null;

  function reset() {
    fileStore.clear();
    writeCalls.length = 0;
    providerCalls.length = 0;
    chapterChunkCounts.clear();
    providerResponses.clear();
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
    const chunkMatch = searchArea.match(/C(\d+)-K(\d+)/);
    if (chunkMatch) {
      return {
        chapter: Number.parseInt(chunkMatch[1], 10),
        chunk: Number.parseInt(chunkMatch[2], 10),
      };
    }

    const chapterMatch = prompt.match(/chapter-(\d+)-seed/);
    if (chapterMatch) {
      return { chapter: Number.parseInt(chapterMatch[1], 10), chunk: 0 };
    }

    throw new Error(`Could not parse chapter/chunk from prompt: ${prompt.slice(0, 200)}`);
  }

  function setProviderResponses(provider: string, responses: Array<string | Error>): void {
    providerResponses.set(provider, [...responses]);
  }

  async function callProvider(provider: string, prompt: string): Promise<string> {
    const { chapter, chunk } = parseCurrentChunkFromPrompt(prompt);
    providerCalls.push({ chapter, chunk, prompt });

    const currentKey = `${chapter}-${chunk}`;
    if (blockedKey === currentKey) {
      return new Promise<string>((resolve) => {
        blockedResolver = resolve;
      });
    }

    const queue = providerResponses.get(provider);
    if (queue && queue.length > 0) {
      const next = queue.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next as string;
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
    setProviderResponses,
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

vi.mock("../helpers/appendBookFile", () => ({
  appendBookFile: vi.fn((fileName: string, content: string, fileType?: string) => {
    const previous = testState.fileStore.get(fileName) || "";
    testState.fileStore.set(fileName, `${previous}${content}`);
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

vi.mock("./new-tooling/compare-chapters-xml", () => ({
  compareXmlTextContent: vi.fn(
    (_original: string, modified: string) => !modified.includes("INVALID"),
  ),
}));

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
  callGeminiWrapper: vi.fn((prompt: string) => testState.callProvider("gemini", prompt)),
  callGeminiVertexWrapper: vi.fn((prompt: string) => testState.callProvider("vertex", prompt)),
}));

vi.mock("../callGrok", () => ({
  callGrok: vi.fn((prompt: string) => testState.callProvider("grok", prompt)),
}));

vi.mock("../callGpt5", () => ({
  callGpt5: vi.fn((prompt: string) => testState.callProvider("gpt-5", prompt)),
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
    vi.mocked(chapterChunker.needsChunking).mockReturnValue(true);
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

  it("uses the same orchestrator for non-chunked chapters", async () => {
    vi.mocked(chapterChunker.needsChunking).mockReturnValue(false);
    testState.configureChapters(1, 1);

    await identifyCharactersAndRewriteParagraphs(createReferenceCards());

    const chapterOutput = testState.fileStore.get("rewritten-paragraphs-for-chapter-1.xml");
    expect(chapterOutput).toContain('<section data-chapter="1"');
    expect(testState.providerCalls.some((call) => call.chapter === 1 && call.chunk === 0)).toBe(
      true,
    );
  });

  it("falls back and selects grok when gpt-5 fallback fails", async () => {
    testState.configureChapters(1, 1);
    testState.setChunkCounts([[1, 1]]);
    testState.setProviderResponses("gemini", ["<p>INVALID-primary</p>"]);
    testState.setProviderResponses("vertex", ["<p>INVALID-primary</p>"]);
    testState.setProviderResponses("gpt-5", [new Error("gpt failure")]);
    testState.setProviderResponses("grok", ["<p>R-C1-K0</p>"]);

    await identifyCharactersAndRewriteParagraphs(createReferenceCards());

    const chapterOutput = testState.fileStore.get("rewritten-paragraphs-for-chapter-1.xml");
    expect(chapterOutput).toContain("R-C1-K0");

    const summaryWrite = [...testState.writeCalls]
      .reverse()
      .find(
        (call) =>
          call.fileName.includes("rewrite-benchmarks/") && call.fileName.endsWith("/summary.json"),
      );
    const summaryRaw = summaryWrite?.content;
    expect(summaryRaw).toBeDefined();
    const summary = JSON.parse(summaryRaw || "{}") as { grokSelectedDueToGptFailure?: number };
    expect(summary.grokSelectedDueToGptFailure).toBeGreaterThanOrEqual(1);
  });

  it("uses per-segment character summaries when segmented reference cards file exists", async () => {
    vi.mocked(chapterChunker.needsChunking).mockReturnValue(false);
    testState.configureChapters(1, 2);

    testState.fileStore.set(
      "single-summary-per-person-by-segment.json",
      JSON.stringify({
        segments: [
          {
            segmentId: "book-1",
            chapterNumbers: [1],
            characters: [{ name: "Alice", referenceCard: "Alice segment one summary" }],
          },
          {
            segmentId: "book-2",
            chapterNumbers: [2],
            characters: [{ name: "Bob", referenceCard: "Bob segment two summary" }],
          },
        ],
        chapterToSegment: { "1": "book-1", "2": "book-2" },
      }),
    );

    await identifyCharactersAndRewriteParagraphs(createReferenceCards());

    const chapter1Call = testState.providerCalls.find((call) => call.chapter === 1);
    const chapter2Call = testState.providerCalls.find((call) => call.chapter === 2);

    expect(chapter1Call?.prompt).toContain("Alice segment one summary");
    expect(chapter1Call?.prompt).not.toContain("Bob segment two summary");
    expect(chapter2Call?.prompt).toContain("Bob segment two summary");
    expect(chapter2Call?.prompt).not.toContain("Alice segment one summary");
  });
});
