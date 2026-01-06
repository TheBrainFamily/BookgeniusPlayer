import { z } from "zod";
import OpenAI from "openai";
import { generateObject } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://bookgenius.net", // Optional. Site URL for rankings on openrouter.ai.
    "X-Title": "BookGenius", // Optional. Site title for rankings on openrouter.ai.
  },
});

export const callGrokWithSchema = async <T>(prompt: string, zodSchema: z.ZodSchema<T>) => {
  const { object } = await generateObject({
    model: openrouter("x-ai/grok-4.1-fast"),
    schema: zodSchema,
    prompt,
    // providerOptions: { google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: true } } },
    experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
  });

  return object as T;
};

export const callGrok = async (prompt: string) => {
  const completion = await openai.chat.completions.create({
    model: "x-ai/grok-4.1-fast",
    messages: [{ role: "user", content: prompt }],
  });

  return completion.choices[0].message.content;
};

async function main() {
  const responseSchema = z.object({ thoughts: z.array(z.string()) });

  const thoughts = await callGrokWithSchema(
    "what are your thoughts on the following sentence: 'The quick brown fox jumps over the lazy dog.'",
    responseSchema,
  );
  console.log(thoughts);
}

if (require.main === module) {
  main();
}
