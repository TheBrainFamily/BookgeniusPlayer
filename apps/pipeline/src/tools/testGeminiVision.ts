#!/usr/bin/env bun
import "dotenv/config";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";

const GraphicalStyleSchema = z.object({
  backgroundStyle: z.string(),
  periodStyle: z.string(),
  avatarStyle: z.string(),
});

async function testWithAiSdk() {
  const coverPath = path.resolve(
    __dirname,
    "../../standardebooks-data/books/james-joyce_dubliners/images/cover.jpg",
  );
  const imageBuffer = fs.readFileSync(coverPath);
  const imageBase64 = imageBuffer.toString("base64");

  console.log("Testing with Vercel AI SDK + google provider...");

  const { object } = await generateObject({
    model: google("gemini-3-flash-preview"),
    schema: GraphicalStyleSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: `data:image/jpeg;base64,${imageBase64}` },
          {
            type: "text",
            text: `Analyze this book cover image and create a graphical style.

Return:
- backgroundStyle: A detailed style description for generating background images that match this cover's aesthetic
- periodStyle: The time period of the book's setting (e.g., "Early 20th century Dublin")  
- avatarStyle: A detailed style description for generating character portraits that match this cover's aesthetic

Match the actual artistic medium of the cover (oil painting, watercolor, etc.) - don't default to "digital painting".`,
          },
        ],
      },
    ],
  });

  console.log("Result:", JSON.stringify(object, null, 2));
  return object;
}

testWithAiSdk().catch(console.error);
