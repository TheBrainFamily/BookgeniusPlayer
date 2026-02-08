/**
 * generate-music-covers.ts
 *
 * Generates abstract cover art for MP3 songs in a book's music/ folder.
 *
 * Pipeline per song:
 *   1. Extract current title from ID3 tags (music-metadata)
 *   2. Gemini 2.5 Flash — analyze audio → image prompt
 *   3. OpenAI gpt-image-1.5 — generate 1024x1024 PNG
 *   4. sharp — resize to 360x360 WebP
 *   5. node-id3 — embed WebP cover in MP3
 *   6. Upload updated MP3 to Convex (triggers metadata extraction)
 *
 * Usage:
 *   bun apps/pipeline/src/tools/generate-music-covers.ts <book-slug> [--dry-run]
 */

import fs from "fs";
import path from "path";
import os from "os";
import { parseBuffer } from "music-metadata";
import NodeID3 from "node-id3";
import sharp from "sharp";
import OpenAI from "openai";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { z } from "zod";
import { toGeminiSchema } from "../callFastGemini";
import { convex, convexClient } from "../server/convex-client";
import { api } from "@bookgenius/convex/_generated/api";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ASSETS_ROOT = path.resolve(process.cwd(), "ConvexAssets");

const CoverPromptSchema = z.object({
  imagePrompt: z.string().describe("A vivid, abstract visual description for the song cover art"),
});

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function extractTitle(mp3Path: string, basename: string): Promise<string> {
  try {
    const buf = fs.readFileSync(mp3Path);
    // Read first 512KB — ID3v2 tags live at the start
    const slice = new Uint8Array(buf.buffer, buf.byteOffset, Math.min(buf.byteLength, 524288));
    const metadata = await parseBuffer(slice, { mimeType: "audio/mpeg" });
    if (metadata.common.title) return metadata.common.title;
  } catch {
    // fall through
  }
  return basename.replace(/\.mp3$/i, "");
}

async function analyzeWithGemini(
  mp3Path: string,
  songTitle: string,
  bookTitle: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });

  // Upload the MP3 for audio analysis
  const uploaded = await ai.files.upload({ file: mp3Path, config: { mimeType: "audio/mpeg" } });

  const prompt = `You are an expert album art designer. Listen to this song and generate a vivid image prompt for its cover art.

Song title: "${songTitle}"
Book: "${bookTitle}"

Rules:
- Describe an ABSTRACT, ATMOSPHERIC scene — no text, no letters, no words, no people, no faces.
- Focus on mood, color palette, light, texture, and emotion evoked by the music.
- Be specific about colors (e.g. "deep burnt sienna" not "brown").
- Keep it under 80 words.
- The image should feel like fine art, not a stock photo.

Return JSON with a single "imagePrompt" field.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [{ fileData: { fileUri: uploaded.uri!, mimeType: "audio/mpeg" } }, { text: prompt }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(CoverPromptSchema),
      safetySettings: getSafetySettings(),
    },
  });

  const text = response.text ?? "";
  const parsed = CoverPromptSchema.parse(JSON.parse(text));
  return parsed.imagePrompt;
}

function findStyleReference(bookDir: string): Buffer | null {
  const thumbDir = path.join(bookDir, "background-thumbnails");
  if (!fs.existsSync(thumbDir)) return null;

  const images = fs
    .readdirSync(thumbDir)
    .filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f))
    .sort();

  if (images.length === 0) return null;
  return fs.readFileSync(path.join(thumbDir, images[0]));
}

async function generateCoverImage(imagePrompt: string, styleRef: Buffer | null): Promise<Buffer> {
  const openai = new OpenAI();

  const prompt = `Abstract song cover art. No text, no letters, no words, no people. Soft, painterly. Match the visual style of the reference image (color palette, rendering technique, level of abstraction) — but do NOT recreate the scene. Create an abstract, mood-based composition instead. ${imagePrompt}`;

  if (styleRef) {
    const image = new File([styleRef], "style-ref.webp", { type: "image/webp" });
    const result = await openai.images.edit({
      model: "gpt-image-1.5",
      image: [image],
      prompt,
      quality: "medium",
      size: "1024x1024",
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data returned from OpenAI");
    return Buffer.from(b64, "base64");
  }

  // Fallback: no style reference available
  const result = await openai.images.generate({
    model: "gpt-image-1.5",
    prompt,
    quality: "medium",
    size: "1024x1024",
    moderation: "low",
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from OpenAI");
  return Buffer.from(b64, "base64");
}

async function resizeToWebp(pngBuffer: Buffer): Promise<Buffer> {
  return await sharp(pngBuffer).resize(360, 360).webp({ quality: 80 }).toBuffer();
}

function embedCoverInMp3(mp3Path: string, coverWebp: Buffer): string {
  const tmpPath = path.join(os.tmpdir(), `cover-embed-${Date.now()}-${path.basename(mp3Path)}`);
  fs.copyFileSync(mp3Path, tmpPath);

  const tags: NodeID3.Tags = {
    image: {
      mime: "image/webp",
      type: { id: 3, name: "front cover" },
      description: "Cover",
      imageBuffer: coverWebp,
    },
  };

  const success = NodeID3.update(tags, tmpPath);
  if (!success) throw new Error("Failed to write ID3 tags");
  return tmpPath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const slug = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!slug) {
    console.error(
      "Usage: bun apps/pipeline/src/tools/generate-music-covers.ts <book-slug> [--dry-run]",
    );
    process.exit(1);
  }

  const bookPath = `books/${slug}`;
  const musicDir = path.join(ASSETS_ROOT, bookPath, "music");

  if (!fs.existsSync(musicDir)) {
    console.error(`Music directory not found: ${musicDir}`);
    process.exit(1);
  }

  // Get book title from Convex
  const bookMeta = await convexClient.query(api.metadata.getBookMetadata, { bookPath });
  const bookTitle = bookMeta?.title ?? slug;

  // Load style reference from background thumbnails
  const bookDir = path.join(ASSETS_ROOT, bookPath);
  const styleRef = findStyleReference(bookDir);
  if (styleRef) {
    console.log("Using background thumbnail as style reference");
  } else {
    console.log("No background thumbnails found — generating without style reference");
  }

  // Discover MP3s
  const mp3Files = fs
    .readdirSync(musicDir)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .sort();

  if (mp3Files.length === 0) {
    console.error("No MP3 files found in", musicDir);
    process.exit(1);
  }

  console.log(`Book: "${bookTitle}" (${mp3Files.length} songs)${dryRun ? " [DRY RUN]" : ""}`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < mp3Files.length; i++) {
    const basename = mp3Files[i];
    const mp3Path = path.join(musicDir, basename);
    const idx = `[${i + 1}/${mp3Files.length}]`;

    try {
      // 1. Extract title
      const title = await extractTitle(mp3Path, basename);
      process.stdout.write(`${idx} "${title}" — analyzing audio...`);

      // 2. Gemini audio → image prompt
      const imagePrompt = await analyzeWithGemini(mp3Path, title, bookTitle);
      console.log(`\n       prompt: "${imagePrompt}"`);

      if (dryRun) {
        succeeded++;
        continue;
      }

      // 3. Generate cover image (OpenAI)
      process.stdout.write(`${idx} "${title}" — generating cover...`);
      const pngBuffer = await generateCoverImage(imagePrompt, styleRef);

      // 4. Resize to 360x360 WebP
      const coverWebp = await resizeToWebp(pngBuffer);
      console.log(` done (${Math.round(coverWebp.length / 1024)}KB)`);

      // 5. Embed cover in MP3 copy
      process.stdout.write(`${idx} "${title}" — uploading...`);
      const tmpMp3 = embedCoverInMp3(mp3Path, coverWebp);

      // 6. Upload updated MP3 to Convex
      const mp3Content = fs.readFileSync(tmpMp3);
      await convex.uploadFile({
        folderPath: `${bookPath}/music`,
        basename,
        content: mp3Content,
        contentType: "audio/mpeg",
      });

      // Clean up temp file
      fs.unlinkSync(tmpMp3);

      console.log(" done ✓");
      succeeded++;
    } catch (err) {
      console.error(`\n${idx} FAILED:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nDone: ${succeeded}/${mp3Files.length} succeeded, ${failed} failed`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
