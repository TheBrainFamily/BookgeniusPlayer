export class AbortError extends Error {
  constructor(message = "Operation aborted") {
    super(message);
    this.name = "AbortError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof AbortError || (error instanceof Error && error.name === "AbortError");
}

export function checkAborted(signal?: AbortSignal, context?: string): void {
  if (!signal?.aborted) {
    return;
  }
  const message = context ? `Operation aborted: ${context}` : "Operation aborted";
  throw new AbortError(message);
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  checkAborted(signal, "before sleep");

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new AbortError("Operation aborted during sleep"));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
