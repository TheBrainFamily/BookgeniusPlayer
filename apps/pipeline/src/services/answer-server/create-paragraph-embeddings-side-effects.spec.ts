import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ inFlight: 0, maxInFlight: 0, calls: 0, delayMs: 5 }));

vi.mock("@google/genai", () => {
  class GoogleGenAI {
    models = {
      embedContent: vi.fn(async () => {
        state.calls += 1;
        state.inFlight += 1;
        state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
        await new Promise((resolve) => setTimeout(resolve, state.delayMs));
        state.inFlight -= 1;
        return { embeddings: [{ values: [0.1, 0.2, 0.3] }] };
      }),
    };
  }

  return { GoogleGenAI };
});

describe("computeBatchEmbeddingsThroughHTTP", () => {
  beforeEach(() => {
    state.inFlight = 0;
    state.maxInFlight = 0;
    state.calls = 0;
    process.env.EMBEDDINGS_BATCH_SIZE = "10";
    process.env.EMBEDDINGS_REQUEST_CONCURRENCY = "3";
  });

  it("caps concurrent embedding requests with EMBEDDINGS_REQUEST_CONCURRENCY", async () => {
    const mod = await import("./create-paragraph-embeddings-side-effects");

    const docs = Array.from({ length: 10 }, (_, i) => ({
      text: `doc-${i}`,
      chapter: 1,
      paragraphNumber: i + 1,
    }));

    const result = await mod.computeBatchEmbeddingsThroughHTTP(docs);

    expect(result).toHaveLength(10);
    expect(state.calls).toBe(10);
    expect(state.maxInFlight).toBeLessThanOrEqual(3);
  });
});
