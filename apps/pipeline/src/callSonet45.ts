import { type z } from "zod";
import { logger } from "./logger";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

import { sleep } from "./tools/sleep";

export const callSonnet45 = async <T = string>(
  prompt: string[],
  schema?: z.ZodSchema<T>,
  maxRetries = 2,
) => {
  let lastError: unknown;
  let attempts = 0;
  const maxAttempts = maxRetries + 1; // First attempt + retries

  while (attempts < maxAttempts) {
    attempts++;
    const isRetry = attempts > 1;

    try {
      if (isRetry) {
        logger.info(`Retry attempt ${attempts - 1} of ${maxRetries}`, "OpenAI");
      }

      const chatCompletion = await generateObject({
        // model: google("gemini-3-pro-preview"),
        // model: openai("gpt-5"),
        model: anthropic("claude-opus-4-5-20251101"),
        messages: prompt.map((p) => ({ role: "user", content: [{ type: "text", text: p }] })),
        // @ts-expect-error(weird zod typing)
        schema,
        // providerOptions: { google: { thinkingConfig: { thinkingBudget: 256 } } },
        // providerOptions: { openai: { reasoningEffort: "low" } },
        providerOptions: { anthropic: { thinking: { type: "disabled" } } },
        experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
      });

      logger.debug(`Prompt: ${prompt[1]}`, "OpenAI");
      logger.debug(`Response: ${JSON.stringify(chatCompletion.object, null, 2)}`, "OpenAI");

      if (schema && chatCompletion.object) {
        logger.success("Received structured response from LLM", "OpenAI");
        const parsedContent = chatCompletion.object as T;
        return parsedContent as T;
      } else {
        const content = chatCompletion.object;
        logger.success("Received text response from LLM", "OpenAI");
        return content as unknown as T;
      }
    } catch (error: unknown) {
      lastError = error;
      logger.error(
        `LLM API error: ${error instanceof Error ? error.message : String(error)}`,
        "OpenAI",
      );

      // If we've reached max attempts, throw the error
      if (attempts >= maxAttempts) {
        logger.error(`Failed after ${attempts} attempts, giving up`, "OpenAI");
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s, etc.
      const backoffTime = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
      logger.info(`Retrying in ${backoffTime}ms...`, "OpenAI");
      await sleep(backoffTime);
    }
  }

  // This should never be reached due to the throw in the catch block,
  // but TypeScript requires a return statement
  throw lastError;
};
