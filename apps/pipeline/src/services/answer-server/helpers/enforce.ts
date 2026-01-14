import arcjet, {
  type ArcjetDecision,
  type ArcjetDenyDecision,
  fixedWindow,
  slidingWindow,
  tokenBucket,
} from "@arcjet/bun";
import * as Sentry from "@sentry/node";
import { SECRET_KEY } from "../secretKey";

export type UserCtx = { userId?: string; isLoggedIn: boolean; clearance: string };
type Tier = "guest" | "user";

// ---------- Helpers ----------
export function tierOf(ctx: UserCtx): Tier {
  return ctx.isLoggedIn ? "user" : "guest";
}

const ARCJET_KEY = process.env.ARCJET_KEY!;
if (!ARCJET_KEY) throw new Error("ARCJET_KEY is required");

export function getRateLimitHeaders(decision: ArcjetDecision): Record<string, string> {
  const headers: Record<string, string> = {};
  headers["X-Arcjet-Decision-Id"] = decision.id ?? "";

  for (const result of decision.results ?? []) {
    if (result.reason.isRateLimit()) {
      const reason = result.reason as { max?: number; remaining?: number; reset?: number };
      if (reason.max !== undefined) {
        headers["X-RateLimit-Limit"] = String(reason.max);
      }
      if (reason.remaining !== undefined) {
        headers["X-RateLimit-Remaining"] = String(reason.remaining);
      }
      if (reason.reset !== undefined) {
        headers["X-RateLimit-Reset"] = String(reason.reset);
        headers["Retry-After"] = String(Math.ceil(reason.reset / 1000));
      }
      break;
    }
  }

  return headers;
}

export function createDenyResponse(decision: ArcjetDenyDecision, message: string): Response {
  Sentry.captureMessage(message, {
    level: "error",
    tags: { "http.status_code": "429", "arcjet.decision_id": decision?.id ?? "" },
  });

  const headers = getRateLimitHeaders(decision);
  headers["Content-Type"] = "application/json";

  return new Response(JSON.stringify({ error: "rate_limited", message }), { status: 429, headers });
}

export function protectProps(ctx: UserCtx, requested = 1) {
  return {
    requested,
    userId: ctx.userId ?? "",
    tier: tierOf(ctx),
    clearance: ctx.clearance, // For non-logged per-user fingerprint
  };
}

const conferenceMultiplier = 3;

// ---------- SEARCH (/getParagraphsForSearch) ----------
// Guests (non-logged: global + per-clearance)
export const ajSearchGuest = arcjet({
  key: ARCJET_KEY,
  rules: [
    // Global non-logged: 40k / hour (token bucket for burst)
    tokenBucket({
      mode: "LIVE",
      characteristics: [],
      refillRate: 40_000,
      interval: 3600,
      capacity: 40_000,
    }),
    // Per-non-logged (clearance): 100 / 4h (sliding for smooth)
    slidingWindow({
      mode: "LIVE",
      characteristics: ["ip.src"],
      interval: 4 * 3600,
      max: 100 * conferenceMultiplier,
    }),
    // Fallback no cookie: strict IP-only low limit
    // fixedWindow({ mode: "LIVE", characteristics: ["ip.src"], window: "1h", max: 2 }),
  ],
});

// Logged-in
export const ajSearchUser = arcjet({
  key: ARCJET_KEY,
  rules: [
    // Global logged: 40k / hour (token bucket)
    tokenBucket({
      mode: "LIVE",
      characteristics: [],
      refillRate: 40_000,
      interval: 3600,
      capacity: 40_000,
    }),
    // Per-user: 100 / 10 min (sliding)
    slidingWindow({
      mode: "LIVE",
      characteristics: ["userId"],
      interval: 10 * 60,
      max: 100 * conferenceMultiplier,
    }),
    // Per-user day cap: 1,000 / day (fixed)
    fixedWindow({ mode: "LIVE", characteristics: ["userId"], window: "1d", max: 1000 }),
  ],
});

// ---------- ASK STREAM (/ask/stream) ----------
// Guests
export const ajAskGuest = arcjet({
  key: ARCJET_KEY,
  rules: [
    // Global non-logged: 50k / day (token bucket) + 2k / hour (token bucket)
    tokenBucket({
      mode: "LIVE",
      characteristics: [],
      refillRate: 50_000,
      interval: 86_400,
      capacity: 50_000,
    }),
    tokenBucket({
      mode: "LIVE",
      characteristics: [],
      refillRate: 2_000,
      interval: 3600,
      capacity: 2_000,
    }),
    // Per-non-logged (clearance): 5 / hour (sliding) + 10 / day (fixed)
    slidingWindow({
      mode: "LIVE",
      characteristics: ["ip.src"],
      interval: 3600,
      max: 5 * conferenceMultiplier,
    }),
    fixedWindow({ mode: "LIVE", characteristics: ["ip.src"], window: "1d", max: 10 }),
    // Fallback no cookie: strict IP-only
    // fixedWindow({ mode: "LIVE", characteristics: ["ip.src"], window: "1h", max: 1 }),
  ],
});

// Logged-in
export const ajAskUser = arcjet({
  key: ARCJET_KEY,
  rules: [
    // Global logged: 2k / hour (token bucket)
    tokenBucket({
      mode: "LIVE",
      characteristics: [],
      refillRate: 2_000,
      interval: 3600,
      capacity: 2_000,
    }),
    // Per-user: 15 / 30 min (sliding) + 100 / day (fixed)
    slidingWindow({
      mode: "LIVE",
      characteristics: ["userId"],
      interval: 30 * 60,
      max: 15 * conferenceMultiplier,
    }),
    fixedWindow({ mode: "LIVE", characteristics: ["userId"], window: "1d", max: 100 }),
  ],
});

// ---------- DEEP RESEARCH (/deepResearch) ----------
// Guests
export const ajDeepGuest = arcjet({
  key: ARCJET_KEY,
  rules: [
    // Global non-logged: 20k / day (token bucket) + 1k / hour (token bucket)
    tokenBucket({
      mode: "LIVE",
      characteristics: [],
      refillRate: 20_000,
      interval: 86_400,
      capacity: 20_000,
    }),
    tokenBucket({
      mode: "LIVE",
      characteristics: [],
      refillRate: 1_000,
      interval: 3600,
      capacity: 1_000,
    }),
    // Per-non-logged (clearance): 2 / 60 min (token bucket for burst) + 4 / day (fixed)
    tokenBucket({
      mode: "LIVE",
      characteristics: ["ip.src"],
      refillRate: 2,
      interval: 60 * 60,
      capacity: 2 * conferenceMultiplier,
    }),
    fixedWindow({
      mode: "LIVE",
      characteristics: ["ip.src"],
      window: "1d",
      max: 4 * conferenceMultiplier,
    }),
    // Fallback no cookie: strict IP-only
    // fixedWindow({ mode: "LIVE", characteristics: ["ip.src"], window: "1h", max: 1 }),
  ],
});

// Logged-in
export const ajDeepUser = arcjet({
  key: ARCJET_KEY,
  rules: [
    // Global logged: 1k / hour (token bucket)
    tokenBucket({
      mode: "LIVE",
      characteristics: [],
      refillRate: 1_000,
      interval: 3600,
      capacity: 1_000,
    }),
    // Per-user: 2 / minute (token bucket for burst) + 50 / day (fixed)
    tokenBucket({
      mode: "LIVE",
      characteristics: ["userId"],
      refillRate: 2,
      interval: 60,
      capacity: 2 * conferenceMultiplier,
    }),
    fixedWindow({
      mode: "LIVE",
      characteristics: ["userId"],
      window: "1d",
      max: 50 * conferenceMultiplier,
    }),
  ],
});

export type EnforceResult =
  | { allowed: true; headers: Record<string, string> }
  | { allowed: false; response: Response };

export async function enforce(
  kind: "search" | "ask" | "deep",
  req: Request,
  ctx: UserCtx,
  requested = 1,
): Promise<EnforceResult> {
  const tier = tierOf(ctx);
  const limiter =
    kind === "search"
      ? RateLimit.search[tier]
      : kind === "ask"
        ? RateLimit.ask[tier]
        : RateLimit.deep[tier];

  const decision = await limiter.protect(req, protectProps(ctx, requested));

  // Fail-open: log errors but proceed if not denied
  for (const r of decision.results ?? []) {
    if (r.reason?.isError?.()) {
      console.warn("Arcjet rule error:", (r.reason as unknown as { message?: string }).message);
    }
  }

  const headers = getRateLimitHeaders(decision);

  const localPass = req.headers.get("x-local-pass");
  if (!decision.isDenied() || localPass === SECRET_KEY) {
    return { allowed: true, headers };
  }

  // Tailored 429s
  if (tier === "guest") {
    return {
      allowed: false,
      response: createDenyResponse(decision, "Limited free actions. Please log in to continue."),
    };
  } else {
    return {
      allowed: false,
      response: createDenyResponse(decision, "You've hit the rate limit. Please try again later."),
    };
  }
}

// Export facade
export const RateLimit = {
  search: { guest: ajSearchGuest, user: ajSearchUser },
  ask: { guest: ajAskGuest, user: ajAskUser },
  deep: { guest: ajDeepGuest, user: ajDeepUser },
};
