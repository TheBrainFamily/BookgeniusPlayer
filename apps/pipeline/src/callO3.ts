import "dotenv/config";
import OpenAI from "openai";
import { type z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
const client = new OpenAI();

/**
 * Call a Large Language Model with optional schema validation and automatic retry
 * @param prompt The prompt to send to the LLM
 * @param schema Optional Zod schema for response validation and structured output
 * @param maxRetries Maximum number of retry attempts (default: 2, meaning 3 total attempts)
 * @returns The LLM response, either as a string or parsed according to the provided schema
 */

export const callO3WithSchema = async <T>(
  prompt: string,
  zodSchema: z.ZodSchema<T>,
  model: string = "o3",
) => {
  const { object } = await generateObject({
    model: openai(model),
    schema: zodSchema,
    prompt,
    experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
  });

  return object as T;
};

export const callGpt5 = async <T = string>(
  prompt: string,
  _schema?: z.ZodSchema<T>,
  _maxRetries = 2,
) => {
  const chatCompletion = await client.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "gpt-5.2",
    reasoning_effort: "medium",
  });
  return chatCompletion.choices[0].message.content as string;
};
