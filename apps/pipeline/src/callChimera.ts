import { z } from "zod";
import OpenAI from "openai";
import { generateObject } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { "HTTP-Referer": "https://bookgenius.net", "X-Title": "BookGenius" },
});

export const callChimeraWithSchema = async <T>(prompt: string, zodSchema: z.ZodSchema<T>) => {
  const result = await generateObject({
    model: openrouter("tngtech/deepseek-r1t2-chimera"),
    schema: zodSchema,
    prompt,
    experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
  });

  console.log("result", JSON.stringify(result, null, 2));
  return result.object as T;
};

export const callChimera = async (prompt: string) => {
  const completion = await openai.chat.completions.create({
    model: "tngtech/deepseek-r1t2-chimera",
    messages: [{ role: "user", content: prompt }],
  });

  return completion.choices[0].message.content;
};

async function main() {
  const responseSchema = z.object({ thoughts: z.array(z.string()) });

  const thoughts = await callChimeraWithSchema(
    "what are your thoughts on the following sentence: 'The quick brown fox jumps over the lazy dog.'",
    responseSchema,
  );
  console.log(thoughts);
}

if (require.main === module) {
  main();
}
