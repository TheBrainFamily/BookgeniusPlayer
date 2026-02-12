import "dotenv/config";
import { type z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";
import { callGemini } from "./callGemini";
import { withTimeout } from "./tools/promiseUtils";
import { callGeminiWithThinking, callGeminiWithThinkingAndSchemaAndParsed } from "./callFastGemini";
const anthropic = new Anthropic({ timeout: 600000 * 3 });
/**
 * Sleep function to wait between retry attempts
 * @param ms Time to sleep in milliseconds
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const LOG_VERBOSE_LLM_ERRORS = process.env.LLM_LOG_VERBOSE_ERRORS === "1";

type ProviderErrorLike = {
  message?: string;
  status?: number;
  statusCode?: number;
  code?: string;
  cause?: { status?: number; statusCode?: number; code?: string };
};

function getProviderErrorStatus(error: unknown): number | undefined {
  const candidate = (error || {}) as ProviderErrorLike;
  return (
    candidate.statusCode ??
    candidate.status ??
    candidate.cause?.statusCode ??
    candidate.cause?.status
  );
}

function isProviderQuotaOrRateLimitError(error: unknown): boolean {
  const status = getProviderErrorStatus(error);
  if (status === 429) {
    return true;
  }

  const message = ((error as ProviderErrorLike | undefined)?.message || "").toLowerCase();
  return (
    message.includes("resource_exhausted") ||
    message.includes("quota exceeded") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

function summarizeProviderError(error: unknown): string {
  const status = getProviderErrorStatus(error);
  const code = ((error as ProviderErrorLike | undefined)?.code || "").toString();
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown provider error";

  const parts = [message];
  if (status) {
    parts.push(`status=${status}`);
  }
  if (code) {
    parts.push(`code=${code}`);
  }

  return parts.join(" | ");
}

const callClaudeWithStreamAndThinking = async (
  prompt: string,
  thinkingTokens: number,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    let result = "";
    try {
      const stream = anthropic.messages.stream({
        model: "claude-opus-4-5-20251101",
        max_tokens: 40000,
        temperature: 1,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        thinking:
          thinkingTokens > 0 ? { type: "enabled", budget_tokens: thinkingTokens } : undefined,
      });
      stream
        .on("text", (text) => {
          result += text;
        })
        .on("finalMessage", () => {
          resolve(result);
        })
        .on("error", (err) => {
          reject(err);
        });
    } catch (err) {
      reject(err);
    }
  });
};

export const callGeminiWrapper = async <T>(
  prompt: string,
  schema?: z.ZodSchema<T>,
  maxRetries = 5,
) => {
  // return callOpenRouter(prompt, schema, maxRetries);
  const result = await callClaude(prompt, schema, maxRetries, 1024, true, true, true);
  return result;
};

export const callGeminiVertexWrapper = async <T>(
  prompt: string,
  schema?: z.ZodSchema<T>,
  maxRetries = 5,
) => {
  const result = await callClaudeInternal(prompt, schema, {
    maxRetries,
    thinkingTokens: 1024,
    useGemini: true,
    useGeminiThinking: true,
    preferVertex: true,
    strictGeminiProvider: true,
  });
  return result;
};

export const callGeminiAlternativeWrapper = async <T>(
  prompt: string,
  schema?: z.ZodSchema<T>,
  maxRetries = 5,
) => {
  const result = await callClaudeInternal(prompt, schema, {
    maxRetries,
    thinkingTokens: 1024,
    useGemini: true,
    useGeminiThinking: true,
    preferAlternativeGeminiKey: true,
    strictGeminiProvider: true,
  });
  return result;
};

const DEBUG = false;
/**
 * Call a Large Language Model with optional schema validation and automatic retry
 * @param prompt The prompt to send to the LLM
 * @param schema Optional Zod schema for response validation and structured output
 * @param maxRetries Maximum number of retry attempts (default: 2, meaning 3 total attempts)
 * @returns The LLM response, either as a string or parsed according to the provided schema
 */

const callClaudeInternal = async <T = string>(
  prompt: string,
  schema?: z.ZodSchema<T>,
  options: {
    maxRetries?: number;
    thinkingTokens?: number;
    useGemini?: boolean;
    useGeminiThinking?: boolean;
    preferVertex?: boolean;
    preferAlternativeGeminiKey?: boolean;
    strictGeminiProvider?: boolean;
  } = {},
  // eslint-disable-next-line complexity -- multi-provider retry with fallback logic; refactor pending
) => {
  const {
    maxRetries = 5,
    thinkingTokens = 1024 * 10,
    useGemini = false,
    useGeminiThinking = true,
    preferVertex = false,
    preferAlternativeGeminiKey = false,
    strictGeminiProvider = false,
  } = options;

  let lastError: unknown;
  let attempts = 0;
  const maxAttempts = maxRetries + 1; // First attempt + retries

  let model: string = "claude";
  if (useGemini) {
    model = preferVertex ? "gemini-vertex" : preferAlternativeGeminiKey ? "gemini-alt" : "gemini";
    if (useGeminiThinking) {
      model = preferVertex
        ? "gemini-vertex-thinking"
        : preferAlternativeGeminiKey
          ? "gemini-alt-thinking"
          : "gemini-thinking";
    }
  }
  // TODO PINGWING when failed with "exception TypeError: fetch failed sending request","stack":"Error: exception TypeError: fetch failed sending reques" we shouldn't retry

  while (attempts < maxAttempts) {
    attempts++;
    const isRetry = attempts > 1;

    try {
      if (isRetry) {
        logger.warning(`Retry attempt ${attempts - 1} of ${maxRetries}`, model);
      }

      // If a schema is provided, we use zodResponseFormat for structured output

      let replyText: string | undefined;
      if (!useGemini) {
        replyText = await callClaudeWithStreamAndThinking(prompt, thinkingTokens);

        // logger.info(`Response for prompt: ${prompt.substring(0, 50)}`, { response: replyText, prompt });
      } else if (useGeminiThinking) {
        logger.debug(
          `Calling Gemini [${model}] promptChars=${prompt.length} prompt=${prompt.substring(0, 50)}`,
          DEBUG ? { prompt } : undefined,
        );
        if (schema) {
          const extracted = await callGeminiWithThinkingAndSchemaAndParsed(
            prompt,
            schema,
            undefined,
            {
              preferVertex,
              useAlternativeApiKey: preferAlternativeGeminiKey,
              strictProvider: strictGeminiProvider,
            },
          );
          logger.success(`Received structured response for prompt: ${prompt.substring(0, 50)}`, {
            response: extracted,
            prompt,
          });
          return extracted;
        } else {
          replyText = await callGeminiWithThinking(prompt, {
            preferVertex,
            useAlternativeApiKey: preferAlternativeGeminiKey,
            strictProvider: strictGeminiProvider,
          });
        }
      } else {
        logger.debug(
          `Calling Gemini not thinking with prompt: ${prompt.substring(0, 50)}`,
          DEBUG ? { prompt } : undefined,
        );
        replyText = (await withTimeout(callGemini(prompt, schema), 1000000)) as string;
      }
      if (schema && replyText) {
        let parsedContent: T;
        if (typeof replyText === "string") {
          try {
            parsedContent = JSON.parse(replyText) as T;
          } catch {
            let cleanedText;
            try {
              // Strip ```json and ``` wrapper if present
              cleanedText = replyText.replace(/^```json\n/, "").replace(/\n```$/, "");
              parsedContent = JSON.parse(cleanedText);
            } catch (e: unknown) {
              logger.error(
                `Failed to parse JSON response: ${replyText}, cleanedText: ${cleanedText}`,
                model,
              );
              throw e;
            }
          }
        } else {
          parsedContent = replyText;
        }
        logger.success(`Received structured response for prompt: ${prompt.substring(0, 50)}`, {
          response: parsedContent,
          prompt,
        });
        return parsedContent;
      } else {
        const content = replyText;
        logger.success(
          `Received text response for prompt: ${prompt.substring(0, 50)}`,
          DEBUG ? { response: content, prompt } : undefined,
        );
        logger.success(`Response: ${content ? content.substring(0, 150) : "empty"}`);
        return content as unknown as T;
      }
    } catch (error: unknown) {
      lastError = error;
      const summary = summarizeProviderError(error);
      const isQuota = isProviderQuotaOrRateLimitError(error);

      if (isQuota) {
        logger.warning(
          `LLM API transient quota/rate-limit: ${summary} | promptChars=${prompt.length}`,
          model,
          LOG_VERBOSE_LLM_ERRORS ? error : undefined,
        );
      } else if (error instanceof Error) {
        logger.error(
          `LLM API error: ${summary} | promptChars=${prompt.length}`,
          model,
          LOG_VERBOSE_LLM_ERRORS ? error : undefined,
        );
      } else {
        logger.error(
          `LLM API error: ${summary} | promptChars=${prompt.length}`,
          model,
          LOG_VERBOSE_LLM_ERRORS ? error : undefined,
        );
      }

      // If we've reached max attempts, throw the error
      if (attempts >= maxAttempts) {
        logger.error(`Failed after ${attempts} attempts, giving up`, model);
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s, etc.
      const backoffTime = Math.min(30000 * Math.pow(2, attempts - 1), 60000);
      logger.info(`Retrying in ${backoffTime}ms...`, model);
      await sleep(backoffTime);
    }
  }

  // This should never be reached due to the throw in the catch block,
  // but TypeScript requires a return statement
  throw lastError;
};

export const callClaude = async <T = string>(
  prompt: string,
  schema?: z.ZodSchema<T>,
  maxRetries = 5,
  thinkingTokens = 1024 * 10,
  useGemini = false,
  useGeminiThinking = true,
  strictGeminiProvider = false,
) => {
  return callClaudeInternal(prompt, schema, {
    maxRetries,
    thinkingTokens,
    useGemini,
    useGeminiThinking,
    strictGeminiProvider,
  });
};

const doIt = async () => {
  const result = (await callGeminiWrapper(
    "Identify all named book characters (people) in this page.\n",
    undefined,
    1,
  )) as string;
  logger.info(result);
};
// Execute only if this file is being run directly (not imported)
if (require.main === module) {
  doIt();
}

// process.on("unhandledRejection", (reason) => {
//   logger.error("UNHANDLED REJECTION:", reason);
// });
// process.on("uncaughtException", (err) => {
//   logger.error("UNCAUGHT EXCEPTION:", err);
// });
