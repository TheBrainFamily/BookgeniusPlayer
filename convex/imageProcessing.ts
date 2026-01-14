"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { Jimp } from "jimp";
import { extractDominantColorFromBase64 } from "./lib/extractDominantColor";

export const getImageMetadata = internalAction({
  args: { sourceUrl: v.string() },
  handler: async (_ctx, { sourceUrl }) => {
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
    extractColors: v.optional(v.boolean()),
  },
  handler: async (_ctx, { sourceUrl, maxWidth = 400, quality = 80, extractColors = false }) => {
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
      ...(extractColors && { extractColors: "true" }),
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
      backgroundColor: result.backgroundColor as string | undefined,
      textColor: result.textColor as string | undefined,
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

export const extractDominantColor = internalAction({
  args: { base64Data: v.string() },
  handler: async (_ctx, { base64Data }) => {
    return await extractDominantColorFromBase64(base64Data);
  },
});
