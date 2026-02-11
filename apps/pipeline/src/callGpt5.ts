import "dotenv/config";
import OpenAI from "openai";
import { z } from "zod";
import { streamObject } from "ai";

import { createOpenAI } from "@ai-sdk/openai";

/**
 * Call a Large Language Model with optional schema validation and automatic retry
 * @param prompt The prompt to send to the LLM
 * @param schema Optional Zod schema for response validation and structured output
 * @param maxRetries Maximum number of retry attempts (default: 2, meaning 3 total attempts)
 * @returns The LLM response, either as a string or parsed according to the provided schema
 */

const api_key = process.env.AZURE_GPT_5_2_KEY;
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;

if (!api_key) {
  throw new Error("AZURE_GPT_5_2_KEY is not set");
}

if (!endpoint) {
  throw new Error("AZURE_OPENAI_ENDPOINT is not set");
}
const openai = createOpenAI({ baseURL: endpoint, apiKey: api_key });

const client = new OpenAI({ baseURL: endpoint, apiKey: api_key });

const ignore = (chunk: unknown) => {
  return chunk;
};
export const callGpt5WithSchema = async <T>(
  prompt: string,
  zodSchema: z.ZodSchema<T>,
  model: string = "gpt-5.2",
) => {
  const { object, partialObjectStream } = await streamObject({
    model: openai(model),
    schema: zodSchema,
    prompt,
    experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
  });

  for await (const chunk of partialObjectStream) {
    ignore(chunk);
  }

  return await object;
};
export const callGpt5 = async <T = string>(
  prompt: string,
  _schema?: z.ZodSchema<T>,
  _maxRetries = 2,
) => {
  const chatCompletion = await client.chat.completions.stream({
    messages: [{ role: "user", content: prompt }],
    model: "gpt-5.2",
    reasoning_effort: "medium",
  });
  let response = "";
  for await (const chunk of chatCompletion) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      response += content;
    }
  }
  return response;
};

if (require.main === module) {
  const response2 = await callGpt5WithSchema(
    "What is the capital of France and poulation of France and the capital?",
    z.object({ capital: z.string(), population: z.number(), capitalPopulation: z.number() }),
  );
  console.log(response2);
}
