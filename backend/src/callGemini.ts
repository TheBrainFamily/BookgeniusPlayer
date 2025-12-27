import "dotenv/config";
import { z } from "zod";
import { callGeminiWithThinkingAndSchemaAndParsed } from "./callFastGemini";
import { callGeminiWithThinking } from "./callFastGemini";

export const callGemini = async <T>(prompt: string, schema?: z.ZodSchema<T>) => {
  if (schema) {
    return callGeminiWithThinkingAndSchemaAndParsed(prompt, schema);
  } else {
    return callGeminiWithThinking(prompt);
  }
};
