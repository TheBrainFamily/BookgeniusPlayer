import OpenAI from "openai";
import { type z } from "zod";

const endpoint = "https://bookgenius.services.ai.azure.com/openai/v1/";
const model = "grok-4-fast-reasoning";
const api_key = process.env.AZURE_GROK_KEY;

const client = new OpenAI({ baseURL: endpoint, apiKey: api_key });

export const callGrokAzure = async (prompt: string) => {
  const completion = await client.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model,
  });

  return completion.choices[0].message.content;
};

export const callGrokAzureWithSchema = async <T>(prompt: string, zodSchema: z.ZodSchema<T>) => {
  const completion = await client.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "response",
        strict: true,
        // @ts-expect-error(zod typing)
        schema: zodSchema.shape,
      },
    },
  });
  let result: T;
  try {
    result = JSON.parse(completion.choices[0].message.content as string) as T;
  } catch (e) {
    console.error("Error parsing JSON", e);
    throw e;
  }
  return result;
};

// if (require.main === module) {
//   const schema = z.object({ name: z.string(), age: z.number() });
//   const prompt = "What is my name? My name is John Doe and I'm 30";
//   const result = await callGrokAzureWithSchema(prompt, schema);
//   console.log(result);
//   console.log(result.name);
//   console.log(result.age);
// }
