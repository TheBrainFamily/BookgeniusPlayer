import "dotenv/config";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { logger } from "./logger";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
const client = new OpenAI();

/**
 * Sleep function to wait between retry attempts
 * @param ms Time to sleep in milliseconds
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call a Large Language Model with optional schema validation and automatic retry
 * @param prompt The prompt to send to the LLM
 * @param schema Optional Zod schema for response validation and structured output
 * @param maxRetries Maximum number of retry attempts (default: 2, meaning 3 total attempts)
 * @returns The LLM response, either as a string or parsed according to the provided schema
 */

export const callO3WithSchema = async <T>(prompt: string, zodSchema: z.ZodSchema<T>, model: string = "o3") => {
  const { object } = await generateObject({
    model: openai(model),
    schema: zodSchema,
    prompt: prompt,
    // providerOptions: { google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: true } } },
    experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
  });

  return object as T;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const callGpt5 = async <T = string>(prompt: string, schema?: z.ZodSchema<T>, _maxRetries = 2) => {
  const chatCompletion = await client.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "gpt-5.1",
    reasoning_effort: "medium",
  });
  return chatCompletion.choices[0].message.content as string;
};

export const callO3 = async <T = string>(prompt: string, schema?: z.ZodSchema<T>, maxRetries = 2) => {
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

      // If a schema is provided, we use zodResponseFormat for structured output
      const chatCompletion = await client.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "o3",
        reasoning_effort: "medium",
        // @ts-expect-error (works, weird zod typing)
        response_format: schema ? zodResponseFormat(schema, "response") : undefined,
      });

      logger.debug(`Prompt: ${prompt}`, "OpenAI");
      logger.debug(`Response: ${JSON.stringify(chatCompletion.choices[0].message.content, null, 2)}`, "OpenAI");

      if (schema && chatCompletion.choices[0].message.content) {
        logger.success("Received structured response from LLM", "OpenAI");
        try {
          const parsedContent = JSON.parse(chatCompletion.choices[0].message.content);
          return parsedContent as T;
        } catch (e) {
          logger.error(`Failed to parse JSON response: ${chatCompletion.choices[0].message.content}`, "OpenAI");
          throw e;
        }
      } else {
        const content = chatCompletion.choices[0].message.content;
        logger.success("Received text response from LLM", "OpenAI");
        return content as unknown as T;
      }
    } catch (error) {
      lastError = error;
      logger.error(`LLM API error: ${error instanceof Error ? error.message : "Unknown error"}`, "OpenAI");

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
