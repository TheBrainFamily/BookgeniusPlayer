"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { Jimp } from "jimp";

export const extractDominantColor = internalAction({
  args: { base64Data: v.string() },
  handler: async (ctx, { base64Data }) => {
    const buffer = Buffer.from(base64Data, "base64");
    const image = await Jimp.read(buffer);

    const width = image.width;
    const height = image.height;
    const bitmap = image.bitmap.data;

    let totalR = 0,
      totalG = 0,
      totalB = 0;
    let sampleCount = 0;

    const step = Math.max(1, Math.floor(Math.min(width, height) / 20));

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const r = bitmap[idx];
        const g = bitmap[idx + 1];
        const b = bitmap[idx + 2];
        totalR += r;
        totalG += g;
        totalB += b;
        sampleCount++;
      }
    }

    const avgR = Math.round(totalR / sampleCount);
    const avgG = Math.round(totalG / sampleCount);
    const avgB = Math.round(totalB / sampleCount);

    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    const backgroundColor = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;

    const luminance = (0.299 * avgR + 0.587 * avgG + 0.114 * avgB) / 255;
    const textColor = luminance < 0.5 ? "#f2e4c9" : "#000000";

    return { backgroundColor, textColor, luminance };
  },
});
