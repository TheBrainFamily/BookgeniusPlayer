import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisWindowTokenLimiter } from "./rewrite-token-limiter";

const redisUrl = process.env.REDIS_URL || process.env.VALKEY_URL;
const bunGlobal = (globalThis as { Bun?: { RedisClient: new (url?: string) => unknown } }).Bun;
const describeRedis = redisUrl && bunGlobal?.RedisClient ? describe : describe.skip;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFreshWindow(windowMs: number, minRemainingMs: number): Promise<void> {
  while (windowMs - (Date.now() % windowMs) < minRemainingMs) {
    await sleep(5);
  }
}

describeRedis("rewrite-token-limiter (redis integration)", () => {
  let client: {
    send: (command: string, args: string[]) => Promise<unknown>;
    close: () => void;
  } | null = null;

  beforeAll(async () => {
    const bun = (globalThis as { Bun?: { RedisClient: new (url?: string) => unknown } }).Bun;
    if (!bun?.RedisClient) {
      throw new Error("Bun.RedisClient is not available");
    }
    const rawClient = new bun.RedisClient(redisUrl!) as {
      connect?: () => Promise<void>;
      send: (command: string, args: string[]) => Promise<unknown>;
      close: () => void;
    };
    if (typeof rawClient.connect === "function") {
      await rawClient.connect();
    }
    client = rawClient;
  });

  afterAll(() => {
    client?.close();
  });

  it("blocks until next window when budget is exhausted", async () => {
    const windowMs = 300;
    await waitForFreshWindow(windowMs, 250);

    const limiter = new RedisWindowTokenLimiter({
      redisClient: client!,
      capByProvider: { gemini: 10 },
      windowMs,
      tokenMultiplier: 1,
      keyPrefix: `rewrite-token-limiter-it-1-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      dependencies: { countTokens: (prompt) => Number.parseInt(prompt, 10) },
    });

    await limiter.acquire({ provider: "gemini", prompt: "8" });

    let finished = false;
    const startedAt = Date.now();
    const pending = limiter.acquire({ provider: "gemini", prompt: "4" }).then(() => {
      finished = true;
    });

    await sleep(80);
    expect(finished).toBe(false);

    await pending;
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(120);
  });

  it("keeps concurrent reservations within a single-window cap", async () => {
    const windowMs = 300;
    await waitForFreshWindow(windowMs, 250);

    const limiter = new RedisWindowTokenLimiter({
      redisClient: client!,
      capByProvider: { gemini: 10 },
      windowMs,
      tokenMultiplier: 1,
      keyPrefix: `rewrite-token-limiter-it-2-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      dependencies: { countTokens: (prompt) => Number.parseInt(prompt, 10) },
    });

    let secondFinished = false;
    const first = limiter.acquire({ provider: "gemini", prompt: "8" });
    const second = limiter.acquire({ provider: "gemini", prompt: "8" }).then(() => {
      secondFinished = true;
    });

    await first;
    await sleep(80);
    expect(secondFinished).toBe(false);

    await second;
  });
});
