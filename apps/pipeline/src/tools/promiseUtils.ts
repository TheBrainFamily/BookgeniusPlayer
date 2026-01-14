/**
 * Represents an error thrown when a promise times out.
 */
export class TimeoutError extends Error {
  constructor(message: string = "Operation timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Wraps a promise with a timeout. If the promise does not resolve or reject
 * within the specified duration, it rejects with a TimeoutError.
 *
 * @template T The type of the promise's resolution value.
 * @param {Promise<T>} promise The promise to wrap.
 * @param {number} timeoutMs The timeout duration in milliseconds.
 * @returns {Promise<T>} A new promise that either resolves with the original
 *   promise's result or rejects with a TimeoutError if the timeout is exceeded.
 * @throws {TimeoutError} If the operation times out.
 *
 * @example
 * const longRunningTask = new Promise(resolve => setTimeout(() => resolve('done'), 10000));
 * try {
 *   const result = await withTimeout(longRunningTask, 5000); // Will throw TimeoutError after 5 seconds
 *   console.log(result);
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.error(error.message); // Output: Operation timed out
 *   } else {
 *     console.error('An unexpected error occurred:', error);
 *   }
 * }
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
