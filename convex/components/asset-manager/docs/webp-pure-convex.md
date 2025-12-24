# WebP Conversion - Pure Convex Pattern

Convert images to WebP format directly in Convex actions using jSquash WASM encoders. No external services required.

## When to Use

- You don't have a Cloudflare account
- You want a simple, self-contained solution
- Processing volume is low to moderate
- Cold-start latency (~500ms on first call) is acceptable

## Prerequisites

- Convex project with Node.js actions enabled (`"use node"`)
- npm packages: `jimp`, `@jsquash/webp`

## Installation

```bash
npm install jimp @jsquash/webp
```

## Implementation

```typescript
// convex/imageProcessing.ts
"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { Jimp } from "jimp";
import encode, { init as initWebpEncoder } from "@jsquash/webp/encode.js";

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

export const resizeToWebp = internalAction({
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
```

## Usage

```typescript
// Call from another action or mutation
const result = await ctx.runAction(internal.imageProcessing.resizeToWebp, {
  sourceUrl: "https://example.com/image.jpg",
  maxWidth: 400,
  quality: 80,
});

// result.data is base64-encoded WebP
// result.size is the byte length
// result.width/height are the output dimensions
```

## How It Works

1. **Jimp** decodes the source image (JPEG, PNG, etc.) and handles resizing
2. **jSquash WebP encoder** (WASM) converts the pixel data to WebP format
3. WASM is fetched from unpkg CDN on first use, then cached in memory

## Performance

| Metric                  | Value                             |
| ----------------------- | --------------------------------- |
| First call (cold start) | ~500-800ms (WASM fetch + compile) |
| Subsequent calls        | ~100-200ms                        |
| Memory usage            | ~10-20MB for WASM module          |

The WASM module stays in memory for the lifetime of the Convex action worker, so subsequent calls within the same worker instance are fast.

## Limitations

- WASM must be fetched from CDN on cold start
- No SIMD optimization (standard WASM only)
- Convex action timeout applies (default 10 minutes)

## Alternatives

For higher throughput or lower latency requirements, see [WebP Conversion - Cloudflare Worker Pattern](./webp-cloudflare-worker.md).
