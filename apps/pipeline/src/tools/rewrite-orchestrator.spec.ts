import fs from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RewriteValidationResult } from "./rewrite-orchestrator";

const state = vi.hoisted(() => {
  const tempRoot = `/tmp/rewrite-orchestrator-spec-${Math.random().toString(36).slice(2)}`;

  const calls: Array<{ provider: string; prompt: string }> = [];
  const appendCalls: Array<{ fileName: string; content: string; fileType?: string }> = [];
  const providerQueues: Record<string, Array<unknown>> = {
    gemini: [],
    vertex: [],
    "gpt-5": [],
    grok: [],
  };

  function reset(): void {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    calls.length = 0;
    appendCalls.length = 0;
    providerQueues.gemini = [];
    providerQueues.vertex = [];
    providerQueues["gpt-5"] = [];
    providerQueues.grok = [];
  }

  function enqueueProviderResult(provider: string, value: unknown): void {
    providerQueues[provider].push(value);
  }

  async function invoke(provider: string, prompt: string): Promise<string> {
    calls.push({ provider, prompt });
    const queue = providerQueues[provider];
    if (queue.length === 0) {
      return `${provider}-ok`;
    }

    const next = queue.shift();
    if (next instanceof Error) {
      throw next;
    }

    if (typeof next === "object" && next !== null && "throw" in (next as Record<string, unknown>)) {
      throw (next as { throw: Error }).throw;
    }

    return String(next);
  }

  function writeFile(fileName: string, content: string | Buffer): string {
    const fullPath = `${tempRoot}/${fileName}`;
    const directory = fullPath.slice(0, fullPath.lastIndexOf("/"));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  }

  function appendFile(fileName: string, content: string | Buffer, fileType?: string): string {
    appendCalls.push({ fileName, content: String(content), fileType });
    const fullPath = `${tempRoot}/${fileName}`;
    const directory = fullPath.slice(0, fullPath.lastIndexOf("/"));
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(fullPath, content);
    return fullPath;
  }

  function readFile(fileName: string): string {
    return fs.readFileSync(`${tempRoot}/${fileName}`, "utf8");
  }

  return {
    tempRoot,
    calls,
    appendCalls,
    reset,
    enqueueProviderResult,
    invoke,
    writeFile,
    appendFile,
    readFile,
  };
});

const loggerWarning = vi.hoisted(() => vi.fn());
const loggerInfo = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock("../callClaude", () => ({
  callGeminiWrapper: vi.fn((prompt: string) => state.invoke("gemini", prompt)),
  callGeminiVertexWrapper: vi.fn((prompt: string) => state.invoke("vertex", prompt)),
}));

vi.mock("../callGpt5", () => ({
  callGpt5: vi.fn((prompt: string) => state.invoke("gpt-5", prompt)),
}));

vi.mock("../callGrok", () => ({
  callGrok: vi.fn((prompt: string) => state.invoke("grok", prompt)),
}));

vi.mock("../helpers/writeBookFile", () => ({
  writeBookFile: vi.fn((fileName: string, content: string | Buffer) =>
    state.writeFile(fileName, content),
  ),
}));

vi.mock("../helpers/appendBookFile", () => ({
  appendBookFile: vi.fn((fileName: string, content: string | Buffer, fileType?: string) =>
    state.appendFile(fileName, content, fileType),
  ),
}));

vi.mock("../helpers/abortHelpers", () => ({
  checkAborted: vi.fn(() => undefined),
  isAbortError: vi.fn(() => false),
}));

vi.mock("../logger", () => ({
  logger: { warning: loggerWarning, info: loggerInfo, error: loggerError },
}));

function buildValidation(response: string): RewriteValidationResult {
  const isValid = !response.includes("INVALID");
  return {
    isValid,
    clearedResponse: response,
    restoredResponse: response,
    failureReason: isValid ? undefined : "invalid",
  };
}

async function loadOrchestrator(env: Record<string, string> = {}) {
  vi.resetModules();

  process.env.REWRITE_BENCHMARK_RUN_ID = "spec-run";
  process.env.REWRITE_PRIMARY_SPIKE_THRESHOLD = env.REWRITE_PRIMARY_SPIKE_THRESHOLD || "10";
  process.env.REWRITE_PRIMARY_SPIKE_PAUSE_MS = env.REWRITE_PRIMARY_SPIKE_PAUSE_MS || "100";
  process.env.REWRITE_PRIMARY_MAX_INFRA_ATTEMPTS = env.REWRITE_PRIMARY_MAX_INFRA_ATTEMPTS || "2";
  process.env.REWRITE_FALLBACK_MAX_INFRA_ATTEMPTS = env.REWRITE_FALLBACK_MAX_INFRA_ATTEMPTS || "2";

  return import("./rewrite-orchestrator");
}

describe("rewrite-orchestrator", () => {
  beforeEach(() => {
    state.reset();
    loggerWarning.mockReset();
    loggerInfo.mockReset();
    loggerError.mockReset();
  });

  it("uses round-robin selection between gemini and vertex", async () => {
    const { executeRewriteWithQueues } = await loadOrchestrator();

    const first = await executeRewriteWithQueues({
      chapter: 1,
      prompt: "prompt-1",
      validateResponse: ({ response }) => buildValidation(response),
    });

    const second = await executeRewriteWithQueues({
      chapter: 2,
      prompt: "prompt-2",
      validateResponse: ({ response }) => buildValidation(response),
    });

    expect(first.provider).toBe("gemini");
    expect(second.provider).toBe("vertex");
    expect(state.calls.slice(0, 2).map((call) => call.provider)).toEqual(["gemini", "vertex"]);
  });

  it("retries retryable infra failures in primary queue and then succeeds", async () => {
    const { executeRewriteWithQueues } = await loadOrchestrator();

    state.enqueueProviderResult(
      "gemini",
      Object.assign(new Error("rate limit"), { statusCode: 429 }),
    );
    state.enqueueProviderResult("vertex", "vertex-success");

    const result = await executeRewriteWithQueues({
      chapter: 3,
      prompt: "prompt-3",
      validateResponse: ({ response }) => buildValidation(response),
    });

    expect(result.provider).toBe("vertex");
    expect(result.phase).toBe("primary");
    expect(result.attempts.length).toBe(2);
    expect(result.attempts[0].errorClass).toBe("retryable_infra");
    expect(result.attempts[1].status).toBe("success");
  });

  it("routes validation failure to fallback pair and prefers gpt-5", async () => {
    const { executeRewriteWithQueues } = await loadOrchestrator();

    state.enqueueProviderResult("gemini", "INVALID-primary");
    state.enqueueProviderResult("gpt-5", "gpt-final");
    state.enqueueProviderResult("grok", "grok-final");

    const result = await executeRewriteWithQueues({
      chapter: 4,
      chunkIndex: 0,
      prompt: "prompt-4",
      validateResponse: ({ response }) => buildValidation(response),
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.provider).toBe("gpt-5");
    expect(state.calls.map((call) => call.provider)).toEqual(["gemini", "gpt-5", "grok"]);
  });

  it("selects grok when gpt-5 fallback fails and records it in summary", async () => {
    const { executeRewriteWithQueues } = await loadOrchestrator();

    state.enqueueProviderResult("gemini", new Error("bad request"));
    state.enqueueProviderResult("gpt-5", new Error("gpt failed"));
    state.enqueueProviderResult("grok", "grok-win");

    const result = await executeRewriteWithQueues({
      chapter: 5,
      prompt: "prompt-5",
      validateResponse: ({ response }) => buildValidation(response),
    });

    expect(result.provider).toBe("grok");
    expect(result.phase).toBe("fallback");

    const summary = JSON.parse(state.readFile("rewrite-benchmarks/spec-run/summary.json")) as {
      grokSelectedDueToGptFailure: number;
      finalWinnerCount: Record<string, number>;
    };

    expect(summary.grokSelectedDueToGptFailure).toBeGreaterThanOrEqual(1);
    expect(summary.finalWinnerCount.grok).toBeGreaterThanOrEqual(1);
  });

  it("pauses primary dispatch when retryable failures spike", async () => {
    const { executeRewriteWithQueues } = await loadOrchestrator({
      REWRITE_PRIMARY_SPIKE_THRESHOLD: "2",
      REWRITE_PRIMARY_SPIKE_PAUSE_MS: "10",
    });

    state.enqueueProviderResult("gemini", Object.assign(new Error("gateway"), { statusCode: 502 }));
    state.enqueueProviderResult("vertex", Object.assign(new Error("gateway"), { statusCode: 502 }));
    state.enqueueProviderResult("gemini", Object.assign(new Error("gateway"), { statusCode: 502 }));
    state.enqueueProviderResult("vertex", Object.assign(new Error("gateway"), { statusCode: 502 }));

    await expect(
      executeRewriteWithQueues({
        chapter: 6,
        prompt: "prompt-6",
        validateResponse: ({ response }) => buildValidation(response),
      }),
    ).rejects.toThrow();

    await expect(
      executeRewriteWithQueues({
        chapter: 7,
        prompt: "prompt-7",
        validateResponse: ({ response }) => buildValidation(response),
      }),
    ).rejects.toThrow();

    expect(loggerWarning).toHaveBeenCalled();
  });

  it("writes manifest rows for every attempt", async () => {
    const { executeRewriteWithQueues } = await loadOrchestrator();

    state.enqueueProviderResult("gemini", "good-xml");

    await executeRewriteWithQueues({
      chapter: 8,
      chunkIndex: 3,
      prompt: "prompt-8",
      validateResponse: ({ response }) => buildValidation(response),
    });

    const manifestRaw = state.readFile("rewrite-benchmarks/spec-run/manifest.ndjson");
    const rows = manifestRaw
      .trim()
      .split("\n")
      .map(
        (line) => JSON.parse(line) as { provider: string; chapter: number; chunkIndex?: number },
      );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].provider).toBe("gemini");
    expect(rows[0].chapter).toBe(8);
    expect(rows[0].chunkIndex).toBe(3);
  });

  it("appends one manifest row per attempt instead of rewriting full content", async () => {
    const { executeRewriteWithQueues } = await loadOrchestrator();

    state.enqueueProviderResult(
      "gemini",
      Object.assign(new Error("rate limit"), { statusCode: 429 }),
    );
    state.enqueueProviderResult("vertex", "vertex-success");

    await executeRewriteWithQueues({
      chapter: 9,
      prompt: "prompt-9",
      validateResponse: ({ response }) => buildValidation(response),
    });

    const manifestAppends = state.appendCalls.filter((call) =>
      call.fileName.endsWith("manifest.ndjson"),
    );
    expect(manifestAppends).toHaveLength(2);
    expect(manifestAppends.every((call) => call.content.endsWith("\n"))).toBe(true);
    expect(manifestAppends.every((call) => call.content.trim().split("\n").length === 1)).toBe(
      true,
    );

    const manifestRaw = state.readFile("rewrite-benchmarks/spec-run/manifest.ndjson");
    expect(manifestRaw.trim().split("\n")).toHaveLength(2);
  });
});
