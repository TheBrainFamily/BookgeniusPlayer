type ErrorCandidate = {
  status?: number;
  statusCode?: number;
  code?: string | number;
  message?: string;
  cause?: unknown;
  responseBody?: string;
  body?: string;
};

const RETRYABLE_MESSAGE_PATTERNS = [
  "high demand",
  "try again later",
  "temporarily unavailable",
  "service unavailable",
  "overloaded",
  "gateway",
  "timeout",
  "timed out",
  "rate limit",
  "resource_exhausted",
  "quota exceeded",
  "too many requests",
  "fetch failed",
  "connection reset",
  "socket hang up",
  "econnreset",
  "etimedout",
  "eai_again",
  "network",
];

function getStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getStatusCode(error: unknown): number | null {
  const candidate = (error || {}) as ErrorCandidate;
  const status = candidate.statusCode ?? candidate.status;
  if (typeof status === "number") {
    return status;
  }
  return null;
}

function getErrorCode(error: unknown): string {
  const candidate = (error || {}) as ErrorCandidate;
  return String(candidate.code || "").toLowerCase();
}

function getErrorMessageRecursive(error: unknown): string {
  const candidate = (error || {}) as ErrorCandidate;
  const parts = [candidate.message, candidate.responseBody, candidate.body]
    .map((part) => getStringValue(part || ""))
    .filter(Boolean);
  const joined = parts.join(" ");

  if (candidate.cause) {
    return `${joined} ${getErrorMessageRecursive(candidate.cause)}`.trim();
  }
  if (joined.length > 0) {
    return joined.toLowerCase();
  }
  return getStringValue(error).toLowerCase();
}

export function getRetryableErrorMessage(error: unknown): string {
  return getErrorMessageRecursive(error);
}

export function isRetryableInfraError(error: unknown): boolean {
  const status = getStatusCode(error);
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return true;
  }
  if (typeof status === "number" && status >= 500) {
    return true;
  }

  const code = getErrorCode(error);
  if (
    code === "rate_limit_exceeded" ||
    code === "too_many_requests" ||
    code === "resource_exhausted" ||
    code === "service_unavailable" ||
    code === "timeout"
  ) {
    return true;
  }

  const message = getErrorMessageRecursive(error);
  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
}
