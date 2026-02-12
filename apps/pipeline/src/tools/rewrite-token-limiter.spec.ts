import { describe, expect, it } from "vitest";
import {
  createPrimaryRewriteTokenLimiter,
  InMemoryWindowTokenLimiter,
} from "./rewrite-token-limiter";

describe("rewrite-token-limiter (unit)", () => {
  it("returns a no-op limiter when mode is off", async () => {
    const limiter = createPrimaryRewriteTokenLimiter({
      mode: "off",
      capByProvider: { gemini: 100 },
    });

    await expect(limiter.acquire({ provider: "gemini", prompt: "hello" })).resolves.toBeUndefined();
  });

  it("waits for the next window when cap would be exceeded", async () => {
    let nowMs = 0;
    const sleeps: number[] = [];
    const limiter = new InMemoryWindowTokenLimiter({
      capByProvider: { gemini: 10 },
      windowMs: 100,
      tokenMultiplier: 1,
      dependencies: {
        now: () => nowMs,
        countTokens: (prompt) => Number.parseInt(prompt, 10),
        sleep: async (ms) => {
          sleeps.push(ms);
          nowMs += ms;
        },
      },
    });

    await limiter.acquire({ provider: "gemini", prompt: "8" });
    await limiter.acquire({ provider: "gemini", prompt: "4" });

    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBe(100);
  });

  it("throws when one request exceeds provider cap by itself", async () => {
    const limiter = new InMemoryWindowTokenLimiter({
      capByProvider: { gemini: 3 },
      windowMs: 100,
      tokenMultiplier: 1,
      dependencies: {
        now: () => 0,
        countTokens: (prompt) => Number.parseInt(prompt, 10),
        sleep: async () => undefined,
      },
    });

    await expect(limiter.acquire({ provider: "gemini", prompt: "4" })).rejects.toThrow(
      /token budget impossible/i,
    );
  });
});
