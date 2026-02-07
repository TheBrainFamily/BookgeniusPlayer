import "dotenv/config";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import {
  callGeminiWithThinking,
  callGeminiWithThinkingAndSchemaAndParsed,
} from "../callFastGemini";

const StructuredSchema = z.object({
  animal: z.string(),
  count: z.number().int(),
  sentence: z.string(),
});

function printEnvSummary() {
  const hasVertexApiKey = Boolean(
    process.env.VERTEX_API_KEY ||
    process.env.GOOGLE_CLOUD_API_KEY ||
    process.env.GOOGLE_VERTEX_API_KEY,
  );
  const hasGeminiApiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

  console.log("=== Env Summary ===");
  console.log(`GOOGLE_GENERATIVE_AI_API_KEY: ${hasGeminiApiKey ? "set" : "missing"}`);
  console.log(
    `VERTEX_API_KEY / GOOGLE_CLOUD_API_KEY / GOOGLE_VERTEX_API_KEY: ${hasVertexApiKey ? "set" : "missing"}`,
  );
}

async function testDirectVertexExpress() {
  const apiKey =
    process.env.VERTEX_API_KEY ||
    process.env.GOOGLE_CLOUD_API_KEY ||
    process.env.GOOGLE_VERTEX_API_KEY;

  if (!apiKey) {
    console.log("Skipping direct Vertex test: no Vertex API key configured.");
    return;
  }

  console.log("=== Direct Vertex Test ===");
  const ai = new GoogleGenAI({ vertexai: true, apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: "Reply with exactly: vertex-ok" }] }],
    config: { responseMimeType: "text/plain" },
  });

  console.log("Direct Vertex response:", response.text?.trim());
}

async function testWrapperTextCall() {
  console.log("=== Wrapper Text Call ===");
  const text = await callGeminiWithThinking("Reply with exactly: wrapper-ok");
  console.log("Wrapper text response:", text?.trim());
}

async function testWrapperStructuredCall() {
  console.log("=== Wrapper Structured Call ===");
  const object = await callGeminiWithThinkingAndSchemaAndParsed(
    'Return JSON with animal="fox", count=3, sentence="quick test".',
    StructuredSchema,
  );
  console.log("Wrapper structured response:", object);
}

async function main() {
  printEnvSummary();

  try {
    await testDirectVertexExpress();
  } catch (error) {
    console.error("Direct Vertex test failed:", error);
  }

  try {
    await testWrapperTextCall();
  } catch (error) {
    console.error("Wrapper text call failed:", error);
  }

  try {
    await testWrapperStructuredCall();
  } catch (error) {
    console.error("Wrapper structured call failed:", error);
  }
}

main().catch((error) => {
  console.error("Test script failed:", error);
  process.exit(1);
});
