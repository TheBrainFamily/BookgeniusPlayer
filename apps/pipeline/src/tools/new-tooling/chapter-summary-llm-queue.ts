import PQueue from "p-queue";
import type { z } from "zod";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";
import { withRetry } from "../retry";
import { isRetryableInfraError } from "../retryableErrors";

export type GeminiVertexProvider = "gemini" | "vertex" | "gemini-alt";

const PRIMARY_CONCURRENCY = Number.parseInt(
  process.env.CHAPTER_SUMMARY_PRIMARY_CONCURRENCY ||
    process.env.REWRITE_PRIMARY_CONCURRENCY ||
    "60",
  10,
);
const PRIMARY_INTERVAL_CAP = Number.parseInt(
  process.env.CHAPTER_SUMMARY_PRIMARY_INTERVAL_CAP ||
    process.env.REWRITE_PRIMARY_INTERVAL_CAP ||
    "900",
  10,
);
const PRIMARY_INTERVAL_MS = Number.parseInt(
  process.env.CHAPTER_SUMMARY_PRIMARY_INTERVAL_MS ||
    process.env.REWRITE_PRIMARY_INTERVAL_MS ||
    "60000",
  10,
);
const ENQUEUE_STAGGER_MS = Number.parseInt(
  process.env.CHAPTER_SUMMARY_QUEUE_STAGGER_MS || process.env.REWRITE_QUEUE_STAGGER_MS || "200",
  10,
);
const CALL_MAX_RETRIES = Number.parseInt(
  process.env.CHAPTER_SUMMARY_CALL_MAX_RETRIES || process.env.PIPELINE_STEP_MAX_RETRIES || "60",
  10,
);
const CALL_RETRY_BASE_MS = Number.parseInt(
  process.env.CHAPTER_SUMMARY_CALL_RETRY_BASE_MS ||
    process.env.PIPELINE_STEP_RETRY_BASE_MS ||
    "15000",
  10,
);
const CALL_RETRY_MAX_MS = Number.parseInt(
  process.env.CHAPTER_SUMMARY_CALL_RETRY_MAX_MS ||
    process.env.PIPELINE_STEP_RETRY_MAX_MS ||
    "900000",
  10,
);
const CHAPTER_SUMMARY_ENABLE_GEMINI_ALT = process.env.CHAPTER_SUMMARY_ENABLE_GEMINI_ALT === "1";
const HAS_GEMINI_ALT_KEY = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY_ALTERNATIVE);

const PRIMARY_PROVIDER_ORDER: GeminiVertexProvider[] =
  CHAPTER_SUMMARY_ENABLE_GEMINI_ALT && HAS_GEMINI_ALT_KEY
    ? ["gemini", "vertex", "gemini-alt"]
    : ["gemini", "vertex"];

if (CHAPTER_SUMMARY_ENABLE_GEMINI_ALT && !HAS_GEMINI_ALT_KEY) {
  console.warn(
    "[chapter-summary-queue] CHAPTER_SUMMARY_ENABLE_GEMINI_ALT=1 but GOOGLE_GENERATIVE_AI_API_KEY_ALTERNATIVE is missing; using gemini+vertex only.",
  );
}

const primaryQueue = new PQueue({
  concurrency: PRIMARY_CONCURRENCY,
  intervalCap: PRIMARY_INTERVAL_CAP,
  interval: PRIMARY_INTERVAL_MS,
});

let roundRobinCounter = 0;
let enqueueGate: Promise<void> = Promise.resolve();

function getNextProvider(): GeminiVertexProvider {
  const providerIndex = roundRobinCounter % PRIMARY_PROVIDER_ORDER.length;
  const provider = PRIMARY_PROVIDER_ORDER[providerIndex];
  roundRobinCounter += 1;
  return provider;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForEnqueueStagger(): Promise<void> {
  const current = enqueueGate.then(async () => {
    if (ENQUEUE_STAGGER_MS > 0) {
      await sleep(ENQUEUE_STAGGER_MS);
    }
  });
  enqueueGate = current.catch(() => undefined);
  await current;
}

export async function runChapterSummaryQueuedSchemaCall<T>(params: {
  prompt: string;
  schema: z.ZodSchema<T>;
  model?: string;
  signal?: AbortSignal;
}): Promise<{ provider: GeminiVertexProvider; result: T }> {
  const { prompt, schema, model = "gemini-3-flash-preview", signal } = params;
  let provider: GeminiVertexProvider = "gemini";

  const result = await withRetry<T>(
    async () => {
      provider = getNextProvider();
      await waitForEnqueueStagger();

      return await primaryQueue.add(
        async () =>
          await callGeminiWithThinkingAndSchemaAndParsed(prompt, schema, model, {
            preferVertex: provider === "vertex",
            useAlternativeApiKey: provider === "gemini-alt",
          }),
        { signal, throwOnTimeout: true },
      );
    },
    {
      label: "chapter-summary-queue",
      maxRetries: CALL_MAX_RETRIES,
      baseDelayMs: CALL_RETRY_BASE_MS,
      maxDelayMs: CALL_RETRY_MAX_MS,
      signal,
      isRetryable: (error) => isRetryableInfraError(error),
      onRetry: (attempt, error, delayMs) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[chapter-summary-queue] transient failure attempt ${attempt}/${CALL_MAX_RETRIES} (provider=${provider}): ${message}. Retrying in ${Math.round(delayMs / 1000)}s`,
        );
      },
    },
  );

  return { provider, result };
}
