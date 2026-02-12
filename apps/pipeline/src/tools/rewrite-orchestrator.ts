import fs from "fs";
import PQueue from "p-queue";
import pLimit from "p-limit";
import { callGeminiWithThinking } from "../callFastGemini";
import { callGpt5 } from "../callGpt5";
import { callGrok } from "../callGrok";
import { FILE_TYPE } from "../helpers/filesHelpers";
import { checkAborted, isAbortError } from "../helpers/abortHelpers";
import { logger } from "../logger";
import { writeBookFile } from "../helpers/writeBookFile";
import { appendBookFile } from "../helpers/appendBookFile";
import { createPrimaryRewriteTokenLimiterFromEnv } from "./rewrite-token-limiter";

export type RewriteProviderName = "gemini" | "vertex" | "gemini-alt" | "gpt-5" | "grok";
export type RewritePhase = "primary" | "fallback";
export type RewriteErrorClass = "retryable_infra" | "non_retryable_provider" | "validation_failure";

export interface RewriteAttemptResult {
  provider: RewriteProviderName;
  phase: RewritePhase;
  status: "success" | "failure";
  errorClass?: RewriteErrorClass;
  errorMessage?: string;
  isQuotaError?: boolean;
  retryAfterMs?: number;
  promptChars: number;
  durationMs: number;
  chapter: number;
  chunkIndex?: number;
  attemptNumber: number;
  selectedAsFinal?: boolean;
  validationPassed?: boolean;
  artifactPaths: { raw?: string; restored?: string; diffVsSelected?: string };
}

export interface RewriteValidationResult {
  isValid: boolean;
  clearedResponse: string;
  restoredResponse: string;
  failureReason?: string;
}

interface RunRewriteParams {
  chapter: number;
  chunkIndex?: number;
  prompt: string;
  signal?: AbortSignal;
  validateResponse: (params: {
    response: string;
    provider: RewriteProviderName;
    phase: RewritePhase;
    attemptNumber: number;
  }) => RewriteValidationResult;
}

interface SuccessfulAttempt {
  provider: RewriteProviderName;
  phase: RewritePhase;
  attemptNumber: number;
  validation: RewriteValidationResult;
  attemptRecord: RewriteAttemptResult;
}

interface FailedAttemptResult {
  failedAttempt: RewriteAttemptResult;
}

export interface RewriteExecutionResult {
  output: string;
  provider: RewriteProviderName;
  phase: RewritePhase;
  attempts: RewriteAttemptResult[];
  fallbackUsed: boolean;
}

const PRIMARY_CONCURRENCY = Number.parseInt(process.env.REWRITE_PRIMARY_CONCURRENCY || "60", 10);
const PRIMARY_INTERVAL_CAP = Number.parseInt(process.env.REWRITE_PRIMARY_INTERVAL_CAP || "900", 10);
const PRIMARY_INTERVAL_MS = Number.parseInt(process.env.REWRITE_PRIMARY_INTERVAL_MS || "60000", 10);
const PRIMARY_SPIKE_PAUSE_MS = Number.parseInt(
  process.env.REWRITE_PRIMARY_SPIKE_PAUSE_MS || "15000",
  10,
);
const PRIMARY_SPIKE_WINDOW_MS = Number.parseInt(
  process.env.REWRITE_PRIMARY_SPIKE_WINDOW_MS || "30000",
  10,
);
const PRIMARY_SPIKE_THRESHOLD = Number.parseInt(
  process.env.REWRITE_PRIMARY_SPIKE_THRESHOLD || "10",
  10,
);
const PRIMARY_QUOTA_COOLDOWN_MS = Number.parseInt(
  process.env.REWRITE_PRIMARY_QUOTA_COOLDOWN_MS || "15000",
  10,
);
const PRIMARY_QUOTA_MAX_COOLDOWN_MS = Number.parseInt(
  process.env.REWRITE_PRIMARY_QUOTA_MAX_COOLDOWN_MS || "120000",
  10,
);
const FALLBACK_CONCURRENCY = Number.parseInt(process.env.REWRITE_FALLBACK_CONCURRENCY || "8", 10);
const FALLBACK_PAIR_LIMIT = Number.parseInt(process.env.REWRITE_FALLBACK_PAIR_LIMIT || "8", 10);
const ENQUEUE_STAGGER_MS = Number.parseInt(process.env.REWRITE_QUEUE_STAGGER_MS || "200", 10);
const PRIMARY_MAX_INFRA_ATTEMPTS = Number.parseInt(
  process.env.REWRITE_PRIMARY_MAX_INFRA_ATTEMPTS || "2",
  10,
);
const FALLBACK_MAX_INFRA_ATTEMPTS = Number.parseInt(
  process.env.REWRITE_FALLBACK_MAX_INFRA_ATTEMPTS || "2",
  10,
);
const REWRITE_ENABLE_GEMINI_ALT = process.env.REWRITE_ENABLE_GEMINI_ALT === "1";

const primaryQueue = new PQueue({
  concurrency: PRIMARY_CONCURRENCY,
  intervalCap: PRIMARY_INTERVAL_CAP,
  interval: PRIMARY_INTERVAL_MS,
});

const gptQueue = new PQueue({ concurrency: FALLBACK_CONCURRENCY });
const grokQueue = new PQueue({ concurrency: FALLBACK_CONCURRENCY });
const fallbackPairLimiter = pLimit(FALLBACK_PAIR_LIMIT);
const primaryTokenLimiter = createPrimaryRewriteTokenLimiterFromEnv();
const PRIMARY_PROVIDER_ORDER: Array<
  Extract<RewriteProviderName, "gemini" | "vertex" | "gemini-alt">
> = REWRITE_ENABLE_GEMINI_ALT ? ["gemini", "vertex", "gemini-alt"] : ["gemini", "vertex"];

const runId = process.env.REWRITE_BENCHMARK_RUN_ID || buildRunId();
const benchmarkRoot = `rewrite-benchmarks/${runId}`;
const summaryFileName = `${benchmarkRoot}/summary.json`;

let primaryRoundRobinCounter = 0;
let enqueueGate: Promise<void> = Promise.resolve();
let isPrimaryCoolingDown = false;
let primaryCooldownUntil = 0;
let primaryCooldownTimer: ReturnType<typeof setTimeout> | undefined;
let currentQuotaCooldownMs = PRIMARY_QUOTA_COOLDOWN_MS;
const retryablePrimaryFailures: number[] = [];

const summaryState = {
  runId,
  startedAt: new Date().toISOString(),
  totalAttempts: 0,
  attemptsByPhase: { primary: 0, fallback: 0 },
  attemptsByProvider: { gemini: 0, vertex: 0, "gemini-alt": 0, "gpt-5": 0, grok: 0 } as Record<
    RewriteProviderName,
    number
  >,
  successByProvider: { gemini: 0, vertex: 0, "gemini-alt": 0, "gpt-5": 0, grok: 0 } as Record<
    RewriteProviderName,
    number
  >,
  failuresByErrorClass: {
    retryable_infra: 0,
    non_retryable_provider: 0,
    validation_failure: 0,
  } as Record<RewriteErrorClass, number>,
  finalWinnerCount: { gemini: 0, vertex: 0, "gemini-alt": 0, "gpt-5": 0, grok: 0 } as Record<
    RewriteProviderName,
    number
  >,
  fallbackUsedCount: 0,
  grokSelectedDueToGptFailure: 0,
  updatedAt: new Date().toISOString(),
};

function buildRunId(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${iso}-${random}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type ErrorCandidate = {
  status?: number;
  statusCode?: number;
  code?: string;
  cause?: { code?: string; status?: number; statusCode?: number; message?: string };
  message?: string;
  responseHeaders?: Record<string, string | undefined>;
  responseBody?: string;
};

function getCandidateStatus(candidate: ErrorCandidate): number | undefined {
  return (
    candidate.statusCode ??
    candidate.status ??
    candidate.cause?.statusCode ??
    candidate.cause?.status
  );
}

function hasRetryableErrorCode(candidate: ErrorCandidate): boolean {
  const code = (candidate.code || candidate.cause?.code || "").toString().toUpperCase();
  return (
    code.includes("ECONN") ||
    code.includes("ETIMEDOUT") ||
    code.includes("EAI_AGAIN") ||
    code.includes("ENOTFOUND")
  );
}

function hasRetryableMessage(candidate: ErrorCandidate): boolean {
  const message = (candidate.message || "").toLowerCase();
  const retryablePhrases = [
    "rate limit",
    "resource_exhausted",
    "quota exceeded",
    "too many requests",
    "gateway",
    "bad gateway",
    "service unavailable",
    "timeout",
    "timed out",
    "fetch failed",
  ];

  return retryablePhrases.some((phrase) => message.includes(phrase));
}

function isRetryableInfraError(error: unknown): boolean {
  const candidate = (error || {}) as ErrorCandidate;
  const status = getCandidateStatus(candidate);

  if (status === 429) {
    return true;
  }

  if (typeof status === "number" && status >= 500) {
    return true;
  }

  if (hasRetryableErrorCode(candidate)) {
    return true;
  }

  return hasRetryableMessage(candidate);
}

function classifyProviderError(error: unknown): RewriteErrorClass {
  return isRetryableInfraError(error) ? "retryable_infra" : "non_retryable_provider";
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

function getBackoffMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 5000);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function getErrorStatus(error: unknown): number | undefined {
  const candidate = (error || {}) as ErrorCandidate;
  return (
    candidate.statusCode ??
    candidate.status ??
    candidate.cause?.statusCode ??
    candidate.cause?.status
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  const candidate = (error || {}) as ErrorCandidate;
  return candidate.message || "";
}

function parseRetryDelayToMs(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const numeric = Number.parseFloat(trimmed);
  if (!Number.isNaN(numeric) && /^\d+(\.\d+)?$/.test(trimmed)) {
    return numeric * 1000;
  }

  const secsMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*s/i);
  if (secsMatch) {
    const seconds = Number.parseFloat(secsMatch[1]);
    if (!Number.isNaN(seconds)) {
      return seconds * 1000;
    }
  }

  return undefined;
}

function extractRetryAfterMs(error: unknown): number | undefined {
  const candidate = (error || {}) as ErrorCandidate;
  const retryAfterMs = candidate.responseHeaders?.["retry-after-ms"];
  const retryAfter = candidate.responseHeaders?.["retry-after"];
  const rawBody = candidate.responseBody;

  const byRetryAfterMs = parseRetryDelayToMs(retryAfterMs);
  if (byRetryAfterMs && byRetryAfterMs > 0) {
    return byRetryAfterMs;
  }

  if (retryAfter) {
    const bySeconds = Number.parseFloat(retryAfter);
    if (!Number.isNaN(bySeconds) && bySeconds > 0) {
      return bySeconds * 1000;
    }

    const retryAt = Date.parse(retryAfter);
    if (!Number.isNaN(retryAt)) {
      const delta = retryAt - Date.now();
      if (delta > 0) {
        return delta;
      }
    }
  }

  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody) as {
        error?: { details?: Array<{ "@type"?: string; retryDelay?: string }> };
      };
      const details = parsed.error?.details || [];
      const retryInfo = details.find((d) => d?.["@type"]?.includes("google.rpc.RetryInfo"));
      const retryDelay = parseRetryDelayToMs(retryInfo?.retryDelay);
      if (retryDelay && retryDelay > 0) {
        return retryDelay;
      }
    } catch {
      // ignore parse issues and continue with message heuristics
    }
  }

  const message = getErrorMessage(error);
  const messageRetryDelay = parseRetryDelayToMs(message);
  if (messageRetryDelay && messageRetryDelay > 0) {
    return messageRetryDelay;
  }

  return undefined;
}

function isQuotaRateLimitError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 429) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("resource_exhausted") ||
    message.includes("quota exceeded") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

function buildAttemptFilePrefix(
  chapter: number,
  chunkIndex: number | undefined,
  phase: RewritePhase,
  provider: RewriteProviderName,
  attemptNumber: number,
): string {
  const chunkPart = chunkIndex !== undefined ? `chunk-${chunkIndex}` : "single";
  return `${benchmarkRoot}/outputs/chapter-${chapter}/${chunkPart}-${phase}-${provider}-attempt-${attemptNumber}`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildDiffSummary(left: string, right: string) {
  const normalizedLeft = normalizeWhitespace(left);
  const normalizedRight = normalizeWhitespace(right);
  const equal = normalizedLeft === normalizedRight;

  let mismatchIndex = -1;
  const maxLength = Math.min(normalizedLeft.length, normalizedRight.length);
  for (let i = 0; i < maxLength; i++) {
    if (normalizedLeft[i] !== normalizedRight[i]) {
      mismatchIndex = i;
      break;
    }
  }
  if (mismatchIndex === -1 && normalizedLeft.length !== normalizedRight.length) {
    mismatchIndex = maxLength;
  }

  return {
    equal,
    leftChars: normalizedLeft.length,
    rightChars: normalizedRight.length,
    mismatchIndex,
  };
}

function appendManifestRow(row: RewriteAttemptResult): void {
  appendBookFile(
    `${benchmarkRoot}/manifest.ndjson`,
    `${JSON.stringify(row)}\n`,
    FILE_TYPE.TEMPORARY,
  );

  summaryState.totalAttempts += 1;
  summaryState.attemptsByPhase[row.phase] += 1;
  summaryState.attemptsByProvider[row.provider] += 1;

  if (row.status === "success") {
    summaryState.successByProvider[row.provider] += 1;
  }

  if (row.errorClass) {
    summaryState.failuresByErrorClass[row.errorClass] += 1;
  }

  summaryState.updatedAt = new Date().toISOString();
  writeBookFile(summaryFileName, JSON.stringify(summaryState, null, 2), FILE_TYPE.TEMPORARY);
}

function markFallbackUsage(): void {
  summaryState.fallbackUsedCount += 1;
  summaryState.updatedAt = new Date().toISOString();
  writeBookFile(summaryFileName, JSON.stringify(summaryState, null, 2), FILE_TYPE.TEMPORARY);
}

function markFinalWinner(provider: RewriteProviderName): void {
  summaryState.finalWinnerCount[provider] += 1;
  summaryState.updatedAt = new Date().toISOString();
  writeBookFile(summaryFileName, JSON.stringify(summaryState, null, 2), FILE_TYPE.TEMPORARY);
}

function markGrokSelectedDueToGptFailure(): void {
  summaryState.grokSelectedDueToGptFailure += 1;
  summaryState.updatedAt = new Date().toISOString();
  writeBookFile(summaryFileName, JSON.stringify(summaryState, null, 2), FILE_TYPE.TEMPORARY);
}

function pausePrimaryDispatch(durationMs: number, reason: string): void {
  const normalizedMs = Math.max(1, durationMs);
  const now = Date.now();
  const nextUntil = now + normalizedMs;
  const effectiveUntil = Math.max(primaryCooldownUntil, nextUntil);
  const effectiveDuration = effectiveUntil - now;

  const wasCoolingDown = isPrimaryCoolingDown;
  primaryCooldownUntil = effectiveUntil;

  if (!wasCoolingDown) {
    primaryQueue.pause();
    isPrimaryCoolingDown = true;
  }

  logger.warning(`⏸️ Pausing primary rewrite dispatch for ${effectiveDuration}ms (${reason})`);

  if (primaryCooldownTimer) {
    clearTimeout(primaryCooldownTimer);
  }

  primaryCooldownTimer = setTimeout(() => {
    const delayLeft = primaryCooldownUntil - Date.now();
    if (delayLeft > 0) {
      pausePrimaryDispatch(delayLeft, "extended cooldown");
      return;
    }

    primaryQueue.start();
    isPrimaryCoolingDown = false;
    primaryCooldownUntil = 0;
    primaryCooldownTimer = undefined;
    logger.info("▶️ Primary rewrite dispatch resumed");
  }, effectiveDuration);
}

function registerRetryablePrimaryFailure(): void {
  const now = Date.now();
  retryablePrimaryFailures.push(now);

  while (
    retryablePrimaryFailures.length > 0 &&
    retryablePrimaryFailures[0] < now - PRIMARY_SPIKE_WINDOW_MS
  ) {
    retryablePrimaryFailures.shift();
  }

  if (retryablePrimaryFailures.length < PRIMARY_SPIKE_THRESHOLD) {
    return;
  }

  pausePrimaryDispatch(
    PRIMARY_SPIKE_PAUSE_MS,
    `${retryablePrimaryFailures.length} retryable failures in ${PRIMARY_SPIKE_WINDOW_MS}ms`,
  );
}

function registerQuotaPrimaryFailure(
  provider: RewriteProviderName,
  promptChars: number,
  retryAfterMs?: number,
): void {
  const requestedCooldownMs =
    retryAfterMs && retryAfterMs > 0
      ? retryAfterMs
      : Math.min(currentQuotaCooldownMs, PRIMARY_QUOTA_MAX_COOLDOWN_MS);
  const cooldownMs = Math.min(
    Math.max(1, Math.ceil(requestedCooldownMs)),
    PRIMARY_QUOTA_MAX_COOLDOWN_MS,
  );

  currentQuotaCooldownMs = Math.min(currentQuotaCooldownMs * 2, PRIMARY_QUOTA_MAX_COOLDOWN_MS);
  pausePrimaryDispatch(
    cooldownMs,
    `quota/rate-limit from ${provider} (promptChars=${promptChars})`,
  );
}

function resetQuotaCooldownOnPrimarySuccess(): void {
  currentQuotaCooldownMs = PRIMARY_QUOTA_COOLDOWN_MS;
}

async function waitForEnqueueStagger(signal?: AbortSignal): Promise<void> {
  const current = enqueueGate.then(async () => {
    checkAborted(signal, "rewrite queue stagger");
    await sleep(ENQUEUE_STAGGER_MS);
  });

  enqueueGate = current.catch(() => undefined);
  await current;
}

async function waitForPrimaryCooldown(signal?: AbortSignal): Promise<void> {
  while (primaryCooldownUntil > 0) {
    const waitMs = primaryCooldownUntil - Date.now();
    if (waitMs <= 0) {
      return;
    }
    checkAborted(signal, "primary cooldown wait");
    await sleep(waitMs);
  }
}

async function enqueuePrimary<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  while (true) {
    await waitForPrimaryCooldown(signal);
    await waitForEnqueueStagger(signal);

    // Cooldown may start while this task is waiting its stagger slot.
    if (primaryCooldownUntil > Date.now()) {
      continue;
    }

    checkAborted(signal, "enqueue primary request");
    return primaryQueue.add(() => fn(), { signal, throwOnTimeout: true });
  }
}

async function enqueueFallback<T>(
  provider: RewriteProviderName,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  checkAborted(signal, `enqueue fallback ${provider}`);
  const queue = provider === "gpt-5" ? gptQueue : grokQueue;
  return queue.add(() => fn(), { signal, throwOnTimeout: true });
}

function getNextPrimaryProvider(): RewriteProviderName {
  const provider = PRIMARY_PROVIDER_ORDER[primaryRoundRobinCounter % PRIMARY_PROVIDER_ORDER.length];
  primaryRoundRobinCounter += 1;
  return provider;
}

async function callProvider(provider: RewriteProviderName, prompt: string): Promise<string> {
  if (provider === "gemini") {
    return await callGeminiWithThinking(prompt, { strictProvider: true });
  }

  if (provider === "vertex") {
    return await callGeminiWithThinking(prompt, { preferVertex: true, strictProvider: true });
  }

  if (provider === "gemini-alt") {
    return await callGeminiWithThinking(prompt, {
      useAlternativeApiKey: true,
      strictProvider: true,
    });
  }

  if (provider === "gpt-5") {
    return (await callGpt5(prompt, undefined, 1)) as string;
  }

  return (await callGrok(prompt)) as string;
}

async function runProviderAttempt(params: {
  provider: RewriteProviderName;
  phase: RewritePhase;
  chapter: number;
  chunkIndex?: number;
  attemptNumber: number;
  prompt: string;
  signal?: AbortSignal;
  validateResponse: RunRewriteParams["validateResponse"];
}): Promise<SuccessfulAttempt | FailedAttemptResult> {
  const { provider, phase, chapter, chunkIndex, attemptNumber, prompt, signal, validateResponse } =
    params;
  const startedAt = Date.now();

  try {
    checkAborted(signal, `rewrite ${provider} call`);
    if (
      phase === "primary" &&
      (provider === "gemini" || provider === "vertex" || provider === "gemini-alt")
    ) {
      await primaryTokenLimiter.acquire({ provider, prompt, signal });
    }

    const response =
      phase === "primary"
        ? await enqueuePrimary(() => callProvider(provider, prompt), signal)
        : await enqueueFallback(provider, () => callProvider(provider, prompt), signal);

    const validation = validateResponse({ response, provider, phase, attemptNumber });
    const attemptPrefix = buildAttemptFilePrefix(
      chapter,
      chunkIndex,
      phase,
      provider,
      attemptNumber,
    );

    const rawPath = writeBookFile(
      `${attemptPrefix}.raw.xml`,
      validation.clearedResponse,
      FILE_TYPE.TEMPORARY,
    );
    const restoredPath = writeBookFile(
      `${attemptPrefix}.restored.xml`,
      validation.restoredResponse,
      FILE_TYPE.TEMPORARY,
    );

    if (!validation.isValid) {
      const failedAttempt: RewriteAttemptResult = {
        provider,
        phase,
        status: "failure",
        errorClass: "validation_failure",
        errorMessage: validation.failureReason || "validation failed",
        promptChars: prompt.length,
        durationMs: Date.now() - startedAt,
        chapter,
        chunkIndex,
        attemptNumber,
        validationPassed: false,
        artifactPaths: { raw: rawPath, restored: restoredPath },
      };
      appendManifestRow(failedAttempt);
      return { failedAttempt };
    }

    const attemptRecord: RewriteAttemptResult = {
      provider,
      phase,
      status: "success",
      promptChars: prompt.length,
      durationMs: Date.now() - startedAt,
      chapter,
      chunkIndex,
      attemptNumber,
      validationPassed: true,
      artifactPaths: { raw: rawPath, restored: restoredPath },
    };
    appendManifestRow(attemptRecord);

    return { provider, phase, attemptNumber, validation, attemptRecord };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    const errorClass = classifyProviderError(error);
    const failedAttempt: RewriteAttemptResult = {
      provider,
      phase,
      status: "failure",
      errorClass,
      errorMessage: sanitizeErrorMessage(error),
      isQuotaError: isQuotaRateLimitError(error),
      retryAfterMs: extractRetryAfterMs(error),
      promptChars: prompt.length,
      durationMs: Date.now() - startedAt,
      chapter,
      chunkIndex,
      attemptNumber,
      validationPassed: false,
      artifactPaths: {},
    };
    appendManifestRow(failedAttempt);

    return { failedAttempt };
  }
}

function markSelectedAttempt(
  attempts: RewriteAttemptResult[],
  selected: SuccessfulAttempt,
): RewriteAttemptResult[] {
  return attempts.map((attempt) => {
    if (
      attempt.provider === selected.provider &&
      attempt.phase === selected.phase &&
      attempt.attemptNumber === selected.attemptNumber &&
      attempt.status === "success"
    ) {
      return { ...attempt, selectedAsFinal: true };
    }

    return attempt;
  });
}

function writeCandidateDiffs(
  attempts: RewriteAttemptResult[],
  selectedOutput: string,
  chapter: number,
  chunkIndex: number | undefined,
): RewriteAttemptResult[] {
  return attempts.map((attempt) => {
    if (!attempt.artifactPaths.restored || attempt.selectedAsFinal) {
      return attempt;
    }

    if (attempt.status !== "success") {
      return attempt;
    }

    const restoredOutput = fs.readFileSync(attempt.artifactPaths.restored, "utf8");
    const diff = buildDiffSummary(restoredOutput, selectedOutput);
    const diffPath = writeBookFile(
      `${benchmarkRoot}/diffs/chapter-${chapter}/chunk-${chunkIndex ?? "single"}-${attempt.phase}-${attempt.provider}-attempt-${attempt.attemptNumber}-vs-selected.json`,
      JSON.stringify(diff, null, 2),
      FILE_TYPE.TEMPORARY,
    );

    return { ...attempt, artifactPaths: { ...attempt.artifactPaths, diffVsSelected: diffPath } };
  });
}

async function runFallbackPair(
  params: {
    chapter: number;
    chunkIndex?: number;
    prompt: string;
    signal?: AbortSignal;
    validateResponse: RunRewriteParams["validateResponse"];
  },
  attempts: RewriteAttemptResult[],
): Promise<{ selected: SuccessfulAttempt; attempts: RewriteAttemptResult[]; gptFailed: boolean }> {
  markFallbackUsage();

  return fallbackPairLimiter(async () => {
    const runWithRetry = async (
      provider: RewriteProviderName,
    ): Promise<SuccessfulAttempt | FailedAttemptResult> => {
      for (let attempt = 0; attempt < FALLBACK_MAX_INFRA_ATTEMPTS; attempt++) {
        const result = await runProviderAttempt({
          provider,
          phase: "fallback",
          chapter: params.chapter,
          chunkIndex: params.chunkIndex,
          attemptNumber: attempt,
          prompt: params.prompt,
          signal: params.signal,
          validateResponse: params.validateResponse,
        });

        if ("failedAttempt" in result) {
          if (
            result.failedAttempt.errorClass === "retryable_infra" &&
            attempt < FALLBACK_MAX_INFRA_ATTEMPTS - 1
          ) {
            await sleep(getBackoffMs(attempt));
            continue;
          }

          return result;
        }

        return result;
      }

      throw new Error(`Fallback ${provider} retry loop exhausted unexpectedly`);
    };

    const [gptResult, grokResult] = await Promise.all([
      runWithRetry("gpt-5"),
      runWithRetry("grok"),
    ]);

    const fallbackAttempts = [...attempts];

    const gptFailed = "failedAttempt" in gptResult;
    if (gptFailed) {
      fallbackAttempts.push(gptResult.failedAttempt);
    } else {
      fallbackAttempts.push(gptResult.attemptRecord);
    }

    if ("failedAttempt" in grokResult) {
      fallbackAttempts.push(grokResult.failedAttempt);
    } else {
      fallbackAttempts.push(grokResult.attemptRecord);
    }

    if (!gptFailed) {
      return { selected: gptResult, attempts: fallbackAttempts, gptFailed };
    }

    if (!("failedAttempt" in grokResult)) {
      return { selected: grokResult, attempts: fallbackAttempts, gptFailed };
    }

    throw new Error(
      `Fallback failed for chapter ${params.chapter}${
        params.chunkIndex !== undefined ? ` chunk ${params.chunkIndex}` : ""
      }: GPT-5=${gptResult.failedAttempt.errorMessage}, Grok=${grokResult.failedAttempt.errorMessage}`,
    );
  });
}

function finalizeResult(
  attempts: RewriteAttemptResult[],
  selected: SuccessfulAttempt,
  fallbackUsed: boolean,
  gptFailed: boolean,
  chapter: number,
  chunkIndex: number | undefined,
): RewriteExecutionResult {
  if (gptFailed && selected.provider === "grok") {
    markGrokSelectedDueToGptFailure();
  }
  markFinalWinner(selected.provider);

  const attemptsWithSelection = writeCandidateDiffs(
    markSelectedAttempt(attempts, selected),
    selected.validation.restoredResponse,
    chapter,
    chunkIndex,
  );

  return {
    output: selected.validation.restoredResponse,
    provider: selected.provider,
    phase: selected.phase,
    attempts: attemptsWithSelection,
    fallbackUsed,
  };
}

export function getRewriteBenchmarkRunId(): string {
  return runId;
}

export async function executeRewriteWithQueues(
  params: RunRewriteParams,
): Promise<RewriteExecutionResult> {
  const { chapter, chunkIndex, prompt, signal, validateResponse } = params;
  checkAborted(
    signal,
    `execute rewrite chapter ${chapter}${chunkIndex !== undefined ? ` chunk ${chunkIndex}` : ""}`,
  );

  const collectedAttempts: RewriteAttemptResult[] = [];

  for (let attempt = 0; attempt < PRIMARY_MAX_INFRA_ATTEMPTS; attempt++) {
    const provider = getNextPrimaryProvider();

    const attemptResult = await runProviderAttempt({
      provider,
      phase: "primary",
      chapter,
      chunkIndex,
      attemptNumber: attempt,
      prompt,
      signal,
      validateResponse,
    });

    if ("failedAttempt" in attemptResult) {
      collectedAttempts.push(attemptResult.failedAttempt);

      if (attemptResult.failedAttempt.errorClass === "validation_failure") {
        const fallbackResult = await runFallbackPair(
          { chapter, chunkIndex, prompt, signal, validateResponse },
          collectedAttempts,
        );

        return finalizeResult(
          fallbackResult.attempts,
          fallbackResult.selected,
          true,
          fallbackResult.gptFailed,
          chapter,
          chunkIndex,
        );
      }

      if (attemptResult.failedAttempt.errorClass === "retryable_infra") {
        if (attemptResult.failedAttempt.isQuotaError) {
          registerQuotaPrimaryFailure(
            provider,
            attemptResult.failedAttempt.promptChars,
            attemptResult.failedAttempt.retryAfterMs,
          );
        }
        registerRetryablePrimaryFailure();

        if (attempt < PRIMARY_MAX_INFRA_ATTEMPTS - 1) {
          await sleep(getBackoffMs(attempt));
          continue;
        }

        throw new Error(
          `Primary retryable infra failure exhausted for chapter ${chapter}${
            chunkIndex !== undefined ? ` chunk ${chunkIndex}` : ""
          }: ${attemptResult.failedAttempt.errorMessage}`,
        );
      }

      const fallbackResult = await runFallbackPair(
        { chapter, chunkIndex, prompt, signal, validateResponse },
        collectedAttempts,
      );

      return finalizeResult(
        fallbackResult.attempts,
        fallbackResult.selected,
        true,
        fallbackResult.gptFailed,
        chapter,
        chunkIndex,
      );
    }

    collectedAttempts.push(attemptResult.attemptRecord);
    if (attemptResult.phase === "primary") {
      resetQuotaCooldownOnPrimarySuccess();
    }

    return finalizeResult(collectedAttempts, attemptResult, false, false, chapter, chunkIndex);
  }

  throw new Error(
    `Primary attempts exhausted for chapter ${chapter}${chunkIndex !== undefined ? ` chunk ${chunkIndex}` : ""}`,
  );
}
