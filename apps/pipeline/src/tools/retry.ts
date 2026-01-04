import { logger } from "../logger";

export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
  isRetryable?: (error: unknown, attempt: number) => boolean;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  jitter?: boolean;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  {
    maxRetries = 2,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    label = "withRetry",
    isRetryable = () => true,
    onRetry,
    jitter = true,
  }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  const maxAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isRetry = attempt > 1;
    try {
      if (isRetry) {
        logger.info(`Retry attempt ${attempt - 1} of ${maxRetries}`, label);
      }
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Operation failed: ${message}`, label, error);

      if (attempt >= maxAttempts || !isRetryable(error, attempt)) {
        logger.error(`Failed after ${attempt} attempts, giving up`, label, error);
        throw error;
      }

      const rawDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const capped = Math.min(rawDelay, maxDelayMs);
      const delay = jitter ? Math.round(capped * (0.8 + Math.random() * 0.4)) : capped;
      logger.info(`Retrying in ${delay}ms...`, label);
      if (onRetry) onRetry(attempt, error, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}
