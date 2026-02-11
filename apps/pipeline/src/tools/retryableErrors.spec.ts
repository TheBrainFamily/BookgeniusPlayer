import { describe, expect, it } from "vitest";
import { isRetryableInfraError } from "./retryableErrors";

describe("isRetryableInfraError", () => {
  it("returns true for high-demand provider message", () => {
    expect(
      isRetryableInfraError(
        new Error(
          "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
        ),
      ),
    ).toBe(true);
  });

  it("returns true for retryable status codes", () => {
    expect(isRetryableInfraError({ statusCode: 429 })).toBe(true);
    expect(isRetryableInfraError({ status: 503 })).toBe(true);
  });

  it("returns false for non-retryable validation style errors", () => {
    expect(isRetryableInfraError(new Error("Invalid prompt schema: missing field"))).toBe(false);
  });
});
