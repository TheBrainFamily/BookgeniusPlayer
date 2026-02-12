import { checkAborted } from "../helpers/abortHelpers";
import { countTokens as defaultCountTokens } from "./chapterChunker";

export type PrimaryRewriteProvider = "gemini" | "vertex" | "gemini-alt";

export interface PrimaryRewriteTokenLimiter {
  acquire(params: {
    provider: PrimaryRewriteProvider;
    prompt: string;
    signal?: AbortSignal;
  }): Promise<void>;
}

export interface PrimaryRewriteTokenLimiterConfig {
  mode: "off" | "memory" | "redis";
  capByProvider: Partial<Record<PrimaryRewriteProvider, number>>;
  windowMs?: number;
  tokenMultiplier?: number;
  keyPrefix?: string;
}

interface TimeHelpers {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

interface CounterDependencies extends TimeHelpers {
  countTokens: (text: string) => number;
}

interface RedisLike {
  send(command: string, args: string[]): Promise<unknown>;
}

interface BunWithRedisClient {
  RedisClient: new (url?: string) => RedisLike;
}

interface AcquireBudgetParams {
  provider: PrimaryRewriteProvider;
  prompt: string;
  signal?: AbortSignal;
}

interface BudgetDecision {
  allowed: boolean;
  retryAfterMs: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_TOKEN_MULTIPLIER = 1;
const DEFAULT_KEY_PREFIX = "rewrite:primary:tpm";
const DEFAULT_REDIS_TTL_MS = DEFAULT_WINDOW_MS * 2;

const RESERVE_SCRIPT = `
local key = KEYS[1]
local add = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
local ttl_ms = tonumber(ARGV[3])

local current = tonumber(redis.call('GET', key) or '0')
if current + add > cap then
  local pttl = redis.call('PTTL', key)
  return {0, current, pttl}
end

local next_value = redis.call('INCRBY', key, add)
if redis.call('PTTL', key) < 0 then
  redis.call('PEXPIRE', key, ttl_ms)
end

local pttl = redis.call('PTTL', key)
return {1, next_value, pttl}
`;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCap(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function normalizeRetryAfterMs(raw: number, windowMs: number, nowMs: number): number {
  if (raw > 0) {
    return raw;
  }
  const remainder = windowMs - (nowMs % windowMs);
  return Math.max(1, remainder);
}

function windowRemainderMs(windowMs: number, nowMs: number): number {
  return normalizeRetryAfterMs(0, windowMs, nowMs);
}

function toTokenCost(
  prompt: string,
  counter: CounterDependencies,
  tokenMultiplier: number,
): number {
  const base = counter.countTokens(prompt);
  const scaled = Math.ceil(base * tokenMultiplier);
  return Math.max(1, scaled);
}

function buildBucketKey(
  provider: PrimaryRewriteProvider,
  nowMs: number,
  windowMs: number,
  keyPrefix: string,
): string {
  const windowBucket = Math.floor(nowMs / windowMs);
  return `${keyPrefix}:${provider}:${windowBucket}`;
}

class NoopTokenLimiter implements PrimaryRewriteTokenLimiter {
  async acquire(): Promise<void> {}
}

export class InMemoryWindowTokenLimiter implements PrimaryRewriteTokenLimiter {
  private readonly capByProvider: Partial<Record<PrimaryRewriteProvider, number>>;
  private readonly windowMs: number;
  private readonly tokenMultiplier: number;
  private readonly dependencies: CounterDependencies;
  private readonly usage = new Map<string, number>();

  constructor(params: {
    capByProvider: Partial<Record<PrimaryRewriteProvider, number>>;
    windowMs?: number;
    tokenMultiplier?: number;
    dependencies?: Partial<CounterDependencies>;
  }) {
    this.capByProvider = params.capByProvider;
    this.windowMs = params.windowMs ?? DEFAULT_WINDOW_MS;
    this.tokenMultiplier = params.tokenMultiplier ?? DEFAULT_TOKEN_MULTIPLIER;
    this.dependencies = {
      now: params.dependencies?.now ?? Date.now,
      sleep:
        params.dependencies?.sleep ??
        ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
      countTokens: params.dependencies?.countTokens ?? defaultCountTokens,
    };
  }

  private reserve(
    provider: PrimaryRewriteProvider,
    tokenCost: number,
    nowMs: number,
  ): BudgetDecision {
    const cap = this.capByProvider[provider];
    if (!cap || cap <= 0) {
      return { allowed: true, retryAfterMs: 0 };
    }
    if (tokenCost > cap) {
      throw new Error(
        `Primary rewrite token budget impossible: tokenCost=${tokenCost} exceeds cap=${cap} for provider=${provider}`,
      );
    }

    const key = buildBucketKey(provider, nowMs, this.windowMs, "mem");
    const used = this.usage.get(key) ?? 0;
    if (used + tokenCost <= cap) {
      this.usage.set(key, used + tokenCost);
      return { allowed: true, retryAfterMs: 0 };
    }

    return { allowed: false, retryAfterMs: normalizeRetryAfterMs(0, this.windowMs, nowMs) };
  }

  async acquire(params: AcquireBudgetParams): Promise<void> {
    const { provider, prompt, signal } = params;
    const tokenCost = toTokenCost(prompt, this.dependencies, this.tokenMultiplier);

    while (true) {
      checkAborted(signal, `token budget wait for ${provider}`);
      const nowMs = this.dependencies.now();
      const decision = this.reserve(provider, tokenCost, nowMs);
      if (decision.allowed) {
        return;
      }
      await this.dependencies.sleep(decision.retryAfterMs);
    }
  }
}

export class RedisWindowTokenLimiter implements PrimaryRewriteTokenLimiter {
  private readonly redisClient: RedisLike;
  private readonly capByProvider: Partial<Record<PrimaryRewriteProvider, number>>;
  private readonly windowMs: number;
  private readonly tokenMultiplier: number;
  private readonly keyPrefix: string;
  private readonly redisTtlMs: number;
  private readonly dependencies: CounterDependencies;

  constructor(params: {
    redisClient: RedisLike;
    capByProvider: Partial<Record<PrimaryRewriteProvider, number>>;
    windowMs?: number;
    tokenMultiplier?: number;
    keyPrefix?: string;
    redisTtlMs?: number;
    dependencies?: Partial<CounterDependencies>;
  }) {
    this.redisClient = params.redisClient;
    this.capByProvider = params.capByProvider;
    this.windowMs = params.windowMs ?? DEFAULT_WINDOW_MS;
    this.tokenMultiplier = params.tokenMultiplier ?? DEFAULT_TOKEN_MULTIPLIER;
    this.keyPrefix = params.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.redisTtlMs = params.redisTtlMs ?? DEFAULT_REDIS_TTL_MS;
    this.dependencies = {
      now: params.dependencies?.now ?? Date.now,
      sleep:
        params.dependencies?.sleep ??
        ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
      countTokens: params.dependencies?.countTokens ?? defaultCountTokens,
    };
  }

  private async reserve(
    provider: PrimaryRewriteProvider,
    tokenCost: number,
    nowMs: number,
  ): Promise<BudgetDecision> {
    const cap = this.capByProvider[provider];
    if (!cap || cap <= 0) {
      return { allowed: true, retryAfterMs: 0 };
    }
    if (tokenCost > cap) {
      throw new Error(
        `Primary rewrite token budget impossible: tokenCost=${tokenCost} exceeds cap=${cap} for provider=${provider}`,
      );
    }

    const key = buildBucketKey(provider, nowMs, this.windowMs, this.keyPrefix);
    const result = await this.redisClient.send("EVAL", [
      RESERVE_SCRIPT,
      "1",
      key,
      `${tokenCost}`,
      `${cap}`,
      `${this.redisTtlMs}`,
    ]);

    if (!Array.isArray(result) || result.length < 3) {
      throw new Error(
        `Unexpected Redis EVAL response for rewrite token limiter: ${String(result)}`,
      );
    }

    const allowed = Number(result[0]) === 1;
    const pttl = Number(result[2]);
    const nextWindowMs = windowRemainderMs(this.windowMs, nowMs);
    return {
      allowed,
      // Important: the key TTL can be longer than a single window (cleanup grace),
      // so we wait at most until the next bucket boundary.
      retryAfterMs: allowed
        ? 0
        : pttl > 0
          ? Math.min(pttl, nextWindowMs)
          : normalizeRetryAfterMs(0, this.windowMs, nowMs),
    };
  }

  async acquire(params: AcquireBudgetParams): Promise<void> {
    const { provider, prompt, signal } = params;
    const tokenCost = toTokenCost(prompt, this.dependencies, this.tokenMultiplier);

    while (true) {
      checkAborted(signal, `token budget wait for ${provider}`);
      const nowMs = this.dependencies.now();
      const decision = await this.reserve(provider, tokenCost, nowMs);
      if (decision.allowed) {
        return;
      }
      await this.dependencies.sleep(decision.retryAfterMs);
    }
  }
}

export function createPrimaryRewriteTokenLimiter(config: PrimaryRewriteTokenLimiterConfig) {
  const hasAnyCap =
    (config.capByProvider.gemini ?? 0) > 0 ||
    (config.capByProvider["gemini-alt"] ?? 0) > 0 ||
    (config.capByProvider.vertex ?? 0) > 0;

  if (config.mode === "off" || !hasAnyCap) {
    return new NoopTokenLimiter();
  }

  if (config.mode === "memory") {
    return new InMemoryWindowTokenLimiter({
      capByProvider: config.capByProvider,
      windowMs: config.windowMs,
      tokenMultiplier: config.tokenMultiplier,
    });
  }

  const redisUrl = process.env.REDIS_URL || process.env.VALKEY_URL;
  if (!redisUrl) {
    throw new Error(
      "REWRITE_PRIMARY_TPM_MODE=redis requires REDIS_URL or VALKEY_URL to be configured",
    );
  }
  const bunGlobal = (globalThis as { Bun?: BunWithRedisClient }).Bun;
  if (!bunGlobal?.RedisClient) {
    throw new Error(
      "REWRITE_PRIMARY_TPM_MODE=redis requires Bun runtime with Bun.RedisClient support",
    );
  }

  const redisClient = new bunGlobal.RedisClient(redisUrl);
  return new RedisWindowTokenLimiter({
    redisClient,
    capByProvider: config.capByProvider,
    windowMs: config.windowMs,
    tokenMultiplier: config.tokenMultiplier,
    keyPrefix: config.keyPrefix,
  });
}

export function createPrimaryRewriteTokenLimiterFromEnv(): PrimaryRewriteTokenLimiter {
  const modeRaw = (process.env.REWRITE_PRIMARY_TPM_MODE || "off").toLowerCase();
  const mode = modeRaw === "memory" || modeRaw === "redis" ? modeRaw : "off";
  const geminiCap = parseCap(process.env.REWRITE_GEMINI_INPUT_TPM_CAP);
  const geminiAltCap = parseCap(process.env.REWRITE_GEMINI_ALT_INPUT_TPM_CAP) ?? geminiCap;
  const vertexCap = parseCap(process.env.REWRITE_VERTEX_INPUT_TPM_CAP);
  const windowMs = parsePositiveInt(process.env.REWRITE_PRIMARY_TPM_WINDOW_MS, DEFAULT_WINDOW_MS);
  const tokenMultiplier = parsePositiveNumber(
    process.env.REWRITE_PRIMARY_TPM_TOKEN_MULTIPLIER,
    DEFAULT_TOKEN_MULTIPLIER,
  );
  const keyPrefix = process.env.REWRITE_PRIMARY_TPM_KEY_PREFIX || DEFAULT_KEY_PREFIX;

  return createPrimaryRewriteTokenLimiter({
    mode,
    capByProvider: { gemini: geminiCap, "gemini-alt": geminiAltCap, vertex: vertexCap },
    windowMs,
    tokenMultiplier,
    keyPrefix,
  });
}
