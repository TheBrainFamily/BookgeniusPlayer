"use node";

/**
 * Image Processing - Reusable image resize and WebP conversion
 *
 * Uses Jimp (pure JavaScript image library) for Convex compatibility.
 *
 * Used for:
 * - Background image thumbnails
 * - Avatar thumbnails (future)
 */

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { Jimp } from "jimp";
import encode, { init as initWebpEncoder } from "@jsquash/webp/encode.js";

/**
 * Resize an image and convert to PNG format.
 * Returns the resized image as base64.
 *
 * Note: Jimp doesn't support WebP output, so we use PNG which is still
 * much smaller than the original for thumbnails.
 */
export const resizeToWebp = internalAction({
  args: {
    sourceUrl: v.string(),
    maxWidth: v.number(), // e.g., 400
    quality: v.number(), // e.g., 80 (1-100)
  },
  handler: async (ctx, { sourceUrl, maxWidth, quality }) => {
    // Fetch the source image
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Load and resize image with Jimp
    const image = await Jimp.read(buffer);

    // Only resize if wider than maxWidth
    if (image.width > maxWidth) {
      image.resize({ w: maxWidth });
    }

    // Convert to JPEG with quality setting (smaller than PNG)
    const outputBuffer = await image.getBuffer("image/jpeg", { quality });

    // Return as base64 string
    return {
      data: outputBuffer.toString("base64"),
      mimeType: "image/jpeg",
      size: outputBuffer.length,
    };
  },
});

/**
 * Get image dimensions without full processing.
 */
export const getImageMetadata = internalAction({
  args: { sourceUrl: v.string() },
  handler: async (ctx, { sourceUrl }) => {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const image = await Jimp.read(buffer);

    return { width: image.width, height: image.height, format: image.mime };
  },
});

export const resizeToWebpViaWorker = internalAction({
  args: {
    sourceUrl: v.string(),
    maxWidth: v.optional(v.number()),
    quality: v.optional(v.number()),
  },
  handler: async (ctx, { sourceUrl, maxWidth = 400, quality = 80 }) => {
    const workerUrl = process.env.WEBP_WORKER_URL;
    const secret = process.env.WEBP_API_SECRET;
    if (!workerUrl || !secret) {
      throw new Error("WEBP_WORKER_URL and WEBP_API_SECRET must be configured");
    }

    const params = new URLSearchParams({
      url: sourceUrl,
      maxWidth: String(maxWidth),
      quality: String(quality),
      json: "true",
    });

    const response = await fetch(`${workerUrl}?${params}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Worker failed: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return {
      data: result.data as string,
      mimeType: result.mimeType as string,
      size: result.size as number,
      width: result.width as number,
      height: result.height as number,
      originalWidth: result.originalWidth as number,
      originalHeight: result.originalHeight as number,
      timing: result.timing as {
        total: number;
        fetch: number;
        decode: number;
        resize: number;
        encode: number;
      },
    };
  },
});

const WEBP_WASM_URL = "https://unpkg.com/@jsquash/webp@1.4.0/codec/enc/webp_enc.wasm";

let webpEncoderInitialized = false;

async function ensureWebpEncoder() {
  if (webpEncoderInitialized) return;

  const wasmResponse = await fetch(WEBP_WASM_URL);
  if (!wasmResponse.ok) {
    throw new Error(`WASM fetch failed: ${wasmResponse.status}`);
  }
  const wasmBuffer = await wasmResponse.arrayBuffer();
  const wasmModule = await WebAssembly.compile(wasmBuffer);
  await initWebpEncoder(wasmModule);
  webpEncoderInitialized = true;
}

/**
 * Resize image and encode to WebP using WASM (no native deps).
 * WASM is fetched from CDN on first use.
 */
export const testWebpEncoding = internalAction({
  args: {
    sourceUrl: v.string(),
    maxWidth: v.optional(v.number()),
    quality: v.optional(v.number()),
  },
  handler: async (ctx, { sourceUrl, maxWidth = 400, quality = 80 }) => {
    await ensureWebpEncoder();

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Image fetch failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const image = await Jimp.read(Buffer.from(arrayBuffer));

    if (image.width > maxWidth) {
      image.resize({ w: maxWidth });
    }

    const { width, height } = image;

    const imageData = {
      data: new Uint8ClampedArray(image.bitmap.data),
      width,
      height,
      colorSpace: "srgb" as const,
    };

    const webpArrayBuffer = await encode(imageData, { quality });

    return {
      data: Buffer.from(webpArrayBuffer).toString("base64"),
      mimeType: "image/webp",
      size: webpArrayBuffer.byteLength,
      width,
      height,
    };
  },
});
