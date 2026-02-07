import PQueue from "p-queue";
import type { z } from "zod";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";

export type GeminiVertexProvider = "gemini" | "vertex";

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
  process.env.CHAPTER_SUMMARY_QUEUE_STAGGER_MS || process.env.REWRITE_QUEUE_STAGGER_MS || "50",
  10,
);

const primaryQueue = new PQueue({
  concurrency: PRIMARY_CONCURRENCY,
  intervalCap: PRIMARY_INTERVAL_CAP,
  interval: PRIMARY_INTERVAL_MS,
});

let roundRobinCounter = 0;
let enqueueGate: Promise<void> = Promise.resolve();

function getNextProvider(): GeminiVertexProvider {
  const provider = roundRobinCounter % 2 === 0 ? "gemini" : "vertex";
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
  const provider = getNextProvider();
  await waitForEnqueueStagger();

  const result = await primaryQueue.add(
    async () =>
      await callGeminiWithThinkingAndSchemaAndParsed(prompt, schema, model, {
        preferVertex: provider === "vertex",
      }),
    { signal, throwOnTimeout: true },
  );

  return { provider, result };
}
