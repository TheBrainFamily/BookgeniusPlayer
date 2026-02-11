import {
  type GenerateContentConfig,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/genai";
import { z } from "zod";
import { google, type GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { generateObject, generateText, streamText } from "ai";
import "dotenv/config";

/**
 * Convert a Zod schema to a Gemini-compatible JSON schema.
 * Replaces `gemini-zod` which doesn't support Zod v4.
 */
export function toGeminiSchema(zodSchema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(zodSchema) as Record<string, unknown>;
  delete jsonSchema["$schema"];
  delete jsonSchema["additionalProperties"];
  return jsonSchema;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type GeminiCallOptions = { preferVertex?: boolean };

type ErrorLike = {
  message?: string;
  statusCode?: number;
  responseHeaders?: Record<string, string | undefined>;
  responseBody?: string;
  errors?: unknown[];
};

function parseRetryDelayToMs(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const numeric = Number.parseFloat(trimmed);
  if (!Number.isNaN(numeric) && /^\d+(\.\d+)?$/.test(trimmed)) {
    return numeric * 1000;
  }

  const match = trimmed.match(/(\d+(?:\.\d+)?)\s*s/i);
  if (match) {
    const value = Number.parseFloat(match[1]);
    return Number.isNaN(value) ? null : value * 1000;
  }

  return null;
}

function parseRetryDelayFromBody(responseBody: string | undefined): number | null {
  if (!responseBody) return null;
  try {
    const parsed = JSON.parse(responseBody) as {
      error?: { details?: Array<{ "@type"?: string; retryDelay?: string }> };
    };
    const details = parsed?.error?.details ?? [];
    const retryInfo = details.find((d) => d?.["@type"]?.includes("google.rpc.RetryInfo"));
    const retryDelay = retryInfo?.retryDelay;
    const parsedDelay = parseRetryDelayToMs(retryDelay);
    if (parsedDelay !== null) {
      return parsedDelay;
    }
  } catch {
    // ignore JSON parse issues; we'll fall back to message pattern
  }

  const messageMatch = responseBody.match(/Please retry in\s+(\d+(?:\.\d+)?)s\.?/i);
  if (messageMatch) {
    const seconds = Number.parseFloat(messageMatch[1]);
    if (!Number.isNaN(seconds)) {
      return seconds * 1000;
    }
  }

  return null;
}

function getErrorCandidates(error: unknown): ErrorLike[] {
  const root = (error ?? {}) as ErrorLike;
  const nested = Array.isArray(root.errors) ? (root.errors as ErrorLike[]) : [];
  return [root, ...nested];
}

function extractRetryDelayMs(error: unknown): number | null {
  const candidates = getErrorCandidates(error);

  for (const candidate of candidates) {
    const retryAfterMs = candidate.responseHeaders?.["retry-after-ms"];
    if (retryAfterMs) {
      const parsed = Number.parseFloat(retryAfterMs);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    const retryAfter = candidate.responseHeaders?.["retry-after"];
    if (retryAfter) {
      const seconds = Number.parseFloat(retryAfter);
      if (!Number.isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }
      const dateMs = Date.parse(retryAfter);
      if (!Number.isNaN(dateMs) && dateMs > Date.now()) {
        return dateMs - Date.now();
      }
    }

    const bodyDelay = parseRetryDelayFromBody(candidate.responseBody);
    if (bodyDelay !== null) {
      return bodyDelay;
    }

    const msgDelay = parseRetryDelayToMs(candidate.message);
    if (msgDelay !== null) {
      return msgDelay;
    }
  }

  return null;
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const candidates = getErrorCandidates(error);
  return candidates.some((candidate) => {
    if (candidate.statusCode === 429) {
      return true;
    }
    const message = (candidate.message ?? "").toLowerCase();
    return (
      message.includes("quota exceeded") ||
      message.includes("resource_exhausted") ||
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("overloaded")
    );
  });
}

function getVertexConfig(): { apiKey: string; enabled: true } | { enabled: false } {
  const apiKey =
    process.env.VERTEX_API_KEY ||
    process.env.GOOGLE_CLOUD_API_KEY ||
    process.env.GOOGLE_VERTEX_API_KEY;

  if (apiKey) {
    return { enabled: true, apiKey };
  }

  return { enabled: false };
}

function getSafetySettings() {
  return [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ];
}

async function collectStreamedText(
  stream: AsyncGenerator<{ text?: string }>,
): Promise<string | null> {
  let text = "";
  for await (const chunk of stream) {
    const piece = chunk.text ?? "";
    if (!piece) continue;
    // SDKs differ: some stream deltas, others stream cumulative snapshots.
    if (piece.startsWith(text)) {
      text = piece;
    } else {
      text += piece;
    }
  }

  return text || null;
}

async function tryVertexTextFallback(prompt: string, model: string): Promise<string | null> {
  const vertex = getVertexConfig();
  if (!vertex.enabled) {
    return null;
  }

  console.log("FALLING BACK TO VERTEX STREAM FOR GEMINI TEXT CALL", model);
  const ai = new GoogleGenAI({ vertexai: true, apiKey: vertex.apiKey });

  const stream = await ai.models.generateContentStream({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "text/plain", safetySettings: getSafetySettings() },
  });

  const text = await collectStreamedText(stream);
  return text ?? "";
}

async function tryVertexSchemaFallback<T>(
  prompt: string,
  zodSchema: z.ZodSchema<T>,
  model: string,
): Promise<T | null> {
  const vertex = getVertexConfig();
  if (!vertex.enabled) {
    return null;
  }

  console.log("FALLING BACK TO VERTEX STREAM FOR GEMINI STRUCTURED CALL", model);
  const ai = new GoogleGenAI({ vertexai: true, apiKey: vertex.apiKey });

  const stream = await ai.models.generateContentStream({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(zodSchema),
      safetySettings: getSafetySettings(),
    },
  });

  const text = await collectStreamedText(stream);
  if (!text) {
    throw new Error("Vertex fallback returned empty structured response");
  }

  const parsed = JSON.parse(text) as unknown;
  return zodSchema.parse(parsed);
}

export const callFastGemini = async (
  prompt: string,
  streamCallback?: (text: string, isFinal: boolean) => void,
) => {
  // TODO This had 0 thinking enabled budget
  const { textStream } = streamText({
    model: google("gemini-3-flash-preview"),
    prompt,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 256, includeThoughts: true } } },
    experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
  });

  let responseText = "";
  for await (const textPart of textStream) {
    responseText += textPart;
    if (streamCallback) {
      streamCallback(responseText, false);
    }
  }

  if (streamCallback) {
    streamCallback(responseText, true);
  }
  return responseText;
};

export const callFastGeminiNoStream = async (prompt: string) => {
  const config = { responseMimeType: "text/plain" };
  const model = "gemini-3-flash-preview";
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  const response = await ai.models.generateContent({ model, config, contents });
  return response?.text;
};

export const callDeepResearchGemini = async (prompt: string, chapters: string[]) => {
  const { text } = await generateText({
    model: google("gemini-3-flash-preview"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Book text:
"""
${chapters.join("\n")}
"""


Based on the book text answer the user's question, using quotes from the wider book text that would allow you to answer the question. You can use the VisibleText to guide your understanding of the question. There is no need to quite the VisibleText directly in your answer since thats what the user is looking at. Unless the ask is to explicitly explain meaning of visible text and quoting would help."`,
          },
        ],
      },
      { role: "user", content: [{ type: "text", text: prompt }] },
    ],
    experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
  });
  return text;
};

export const callGeminiWithThinking = async (prompt: string, options: GeminiCallOptions = {}) => {
  const { preferVertex = false } = options;
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.OFF },
  ];
  console.log("CALLING GEMINI WITH THINKING");
  const model = "gemini-3-flash-preview";
  const maxRateLimitRetries = 1;

  if (preferVertex) {
    const vertexResult = await tryVertexTextFallback(prompt, model).catch(() => null);
    if (vertexResult !== null) {
      return vertexResult;
    }
  }

  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
    try {
      const { textStream } = await streamText({
        model: google(model),
        prompt,
        maxRetries: 0,
        experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
        providerOptions: { google: { safetySettings } },
      });
      let text = "";
      for await (const textPart of textStream) {
        text += textPart;
      }
      return text;
    } catch (error) {
      if (!preferVertex && attempt === 0) {
        const vertexResult = await tryVertexTextFallback(prompt, model).catch(() => null);
        if (vertexResult !== null) {
          return vertexResult;
        }
      }

      if (isQuotaOrRateLimitError(error)) {
        const retryDelayMs = extractRetryDelayMs(error);
        if (retryDelayMs !== null && attempt < maxRateLimitRetries) {
          console.log(
            `Gemini rate-limit detected, waiting ${Math.round(retryDelayMs)}ms before retry`,
          );
          await sleep(retryDelayMs);
          continue;
        }
      }
      throw error;
    }
  }

  throw new Error("Unexpected Gemini retry loop exit");
};

export const callGeminiWithThinkingAndSchema = async <T>(
  prompt: string,
  zodSchema: z.ZodSchema<T>,
  model: string = "gemini-3-pro-preview",
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

  const parsedSchema = toGeminiSchema(zodSchema);
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ];

  const config: GenerateContentConfig = {
    responseMimeType: "application/json",
    responseSchema: parsedSchema,
    safetySettings,
  };

  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  console.log("GOZDECKA USING MODEL " + model);
  const response = await ai.models.generateContent({ model, config, contents });
  return response?.text;
};

export const callGeminiWithThinkingAndSchemaAndParsed = async <T>(
  prompt: string,
  zodSchema: z.ZodSchema<T>,
  model: string = "gemini-3-flash-preview",
  options: GeminiCallOptions = {},
) => {
  const { preferVertex = false } = options;
  console.log("CALLING GEMINI WITH THINKING AND SCHEMA AND PARSED", model);
  const maxRateLimitRetries = 1;

  if (preferVertex) {
    const vertexResult = await tryVertexSchemaFallback(prompt, zodSchema, model).catch(() => null);
    if (vertexResult !== null) {
      return vertexResult;
    }
  }

  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
    try {
      const { object } = await generateObject({
        model: google(model),
        schema: zodSchema,
        prompt,
        maxRetries: 0,
        experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
        providerOptions: {
          google: {
            // @ts-expect-error wrong types
            safetySettings: getSafetySettings(),
            thinkingConfig: { thinkingLevel: "high" },
          } satisfies GoogleGenerativeAIProviderOptions,
        },
      });
      return object as T;
    } catch (error) {
      if (!preferVertex && attempt === 0) {
        const vertexResult = await tryVertexSchemaFallback(prompt, zodSchema, model).catch(
          () => null,
        );
        if (vertexResult !== null) {
          return vertexResult;
        }
      }

      if (isQuotaOrRateLimitError(error)) {
        const retryDelayMs = extractRetryDelayMs(error);
        if (retryDelayMs !== null && attempt < maxRateLimitRetries) {
          console.log(
            `Gemini rate-limit detected, waiting ${Math.round(retryDelayMs)}ms before retry`,
          );
          await sleep(retryDelayMs);
          continue;
        }
      }
      throw error;
    }
  }

  throw new Error("Unexpected Gemini structured retry loop exit");
};

export const callGeminiWithImage = async <T>(
  prompt: string,
  imageBase64: string,
  mimeType: string = "image/jpeg",
  zodSchema?: z.ZodSchema<T>,
): Promise<T> => {
  const model = google("gemini-3-flash-preview");

  if (zodSchema) {
    const { object } = await generateObject({
      model,
      schema: zodSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: `data:${mimeType};base64,${imageBase64}` },
            { type: "text", text: prompt },
          ],
        },
      ],
      providerOptions: {
        google: {
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ],
        },
      },
    });
    return object as T;
  }

  const { text } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: `data:${mimeType};base64,${imageBase64}` },
          { type: "text", text: prompt },
        ],
      },
    ],
    providerOptions: {
      google: {
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      },
    },
  });

  return text as unknown as T;
};

// if (require.main === module) {
//   const doIt = async () => {
//     const response = await callGeminiWithThinking("What is the capital of France?");
//     console.log(response);
//   };
//   doIt();
// }
