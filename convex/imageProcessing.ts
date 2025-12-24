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
  args: {
    sourceUrl: v.string(),
  },
  handler: async (ctx, { sourceUrl }) => {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const image = await Jimp.read(buffer);

    return {
      width: image.width,
      height: image.height,
      format: image.mime,
    };
  },
});
