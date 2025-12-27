import { GenerateContentConfig, GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { z } from "zod";
import { google } from "@ai-sdk/google";
import { generateObject, generateText, streamText, wrapLanguageModel } from "ai";
import { toGeminiSchema } from "gemini-zod";
import "dotenv/config";
import { openrouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV2Middleware } from "@ai-sdk/provider";

export const callFastGemini = async (prompt: string, streamCallback?: (text: string, isFinal: boolean) => void) => {
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
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

export const callGeminiWithThinking = async (prompt: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const config = {
    responseMimeType: "text/plain",
    httpOptions: {
      timeout: 15 * 60 * 1000, // 15 minutes in milliseconds
    },
  };
  // const model = "gemini-3-flash-preview";
  const model = "gemini-3-pro-preview";

  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];

  console.log("before response", model);
  const response = await ai.models.generateContent({ model, config: { ...config, safetySettings }, contents });

  console.log("after response");

  return response?.text;
};

export const callGeminiWithThinkingAndSchema = async <T>(
  prompt: string,
  zodSchema: z.ZodSchema<T>,
  model: string = "gemini-3-pro-preview",
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const parsedSchema = toGeminiSchema(zodSchema);
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
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
  model: string = "gemini-3-pro-preview",
) => {
  const { object } = await generateObject({
    model: google(model),
    schema: zodSchema,
    prompt: prompt,
    // providerOptions: { google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: true } } },
    experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
  });

  return object as T;
};

export const anthropicThinkingSchemaMiddleware: LanguageModelV2Middleware = {
  transformParams: ({ params }) => {
    // Change forced tool choice to optional (Anthropic compatible)
    params.toolChoice = { type: "auto" };

    // Convert schema to optional tool
    if (params.responseFormat?.type === "json" && params.responseFormat.schema) {
      params.tools = [
        {
          type: "function",
          name: "json",
          description: "Respond with a structured JSON object matching the required schema.",
          inputSchema: params.responseFormat.schema,
        },
      ];

      params.responseFormat = { type: "text" };

      // Add instruction to use the tool
      params.prompt.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "Please provide your answer using the json tool. Use extended thinking if needed to ensure accuracy.",
          },
        ],
        providerOptions: undefined,
      });
    }

    return Promise.resolve(params);
  },

  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();

    console.log("result", result);
    // Extract tool call from content array and convert to text response
    if (result.content && result.content.length > 0) {
      const toolCallContent = result.content.find((item) => item.type === "tool-call" && item.toolName === "json");
      if (toolCallContent && toolCallContent.type === "tool-call") {
        // Parse the input string to get the actual JSON object
        const parsedInput =
          typeof toolCallContent.input === "string" ? JSON.parse(toolCallContent.input) : toolCallContent.input;

        // Replace content with text content containing the JSON
        result.content = [{ type: "text", text: JSON.stringify(parsedInput, null, 2) }];
      } else {
        try {
          result.content = [
            {
              type: "text",
              // @ts-expect-error(TODO FIX LATER, IT WORKS)
              text: result.content[result.content.length - 1].text.replace(/^```json\n/, "").replace(/\n```$/, ""),
            },
          ];
        } catch (e) {
          console.error("error", e);
        }
      }
    }

    return result;
  },
};

export const callSlowGeminiWithThinkingAndSchemaAndParsed = async <T>(
  prompt: string,
  zodSchema: z.ZodSchema<T>,
  model: string = "google/gemini-3-flash-preview",
) => {
  const claudeModel = wrapLanguageModel({ model: openrouter(model), middleware: anthropicThinkingSchemaMiddleware });
  const { object } = await generateObject({
    model:
      model.includes("claude") || model.includes("minimax") || model.includes("kimi") ? claudeModel : openrouter(model),
    schema: zodSchema,
    prompt: prompt,
    experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
    providerOptions: {
      openrouter: {
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      },
    },
  });

  return object as T;
};

// if (require.main === module) {
//   const doIt = async () => {
//     const response = await callGeminiWithThinkingAndSchema(
//       "What is the capital of France?",
//       z.object({ capital: z.string() }),
//     );
//     console.log(response);
//   };
//   doIt();
// }
