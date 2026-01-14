# WebP Conversion - Cloudflare Worker Pattern

Convert images to WebP format using a dedicated Cloudflare Worker with SIMD-optimized WASM. Best performance for production workloads.

## When to Use

- You have a Cloudflare account
- You need consistent low latency (~50ms processing)
- High throughput requirements
- Already using Cloudflare R2 for storage

## Prerequisites

- Cloudflare account with Workers enabled
- Wrangler CLI (`npm install -g wrangler`)
- Convex project

## Architecture

```
Convex Action → Cloudflare Worker → WebP Response
                     │
                     ├── Fetch source image
                     ├── Decode (JPEG/PNG)
                     ├── Resize (Lanczos3)
                     └── Encode (WebP SIMD)
```

## Step 1: Deploy the Worker

The worker source is in `apps/webp-compressor/`:

```typescript
// apps/webp-compressor/src/index.ts
import decodeJpeg, { init as initJpegDec } from "@jsquash/jpeg/decode";
import decodePng, { init as initPngDec } from "@jsquash/png/decode";
import encodeWebp, { init as initWebpEnc } from "@jsquash/webp/encode";
import resize, { initResize } from "@jsquash/resize";

// WASM imports bundled with the worker
import JPEG_DEC_WASM from "../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
import PNG_DEC_WASM from "../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
import WEBP_ENC_WASM from "../../../node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm";
import RESIZE_WASM from "../../../node_modules/@jsquash/resize/lib/resize/squoosh_resize_bg.wasm";

interface Env {
  WEBP_API_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const authHeader = request.headers.get("Authorization");
    const expectedToken = `Bearer ${env.WEBP_API_SECRET}`;

    if (!authHeader || authHeader !== expectedToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ... image processing logic
  },
};
```

Deploy with:

```bash
cd apps/webp-compressor
npx wrangler deploy
```

## Step 2: Configure Environment Variables

After deploying, wrangler outputs the worker URL. Set both the URL and a secret in Convex:

```bash
# Set the worker URL (use your actual URL from wrangler deploy output)
npx convex env set WEBP_WORKER_URL "https://your-worker.your-subdomain.workers.dev"

# Generate and set shared secret
SECRET=$(openssl rand -base64 32)

# Set in Cloudflare Worker
cd apps/webp-compressor
echo "$SECRET" | npx wrangler secret put WEBP_API_SECRET

# Set in Convex
npx convex env set WEBP_API_SECRET "$SECRET"
```

## Step 3: Create Convex Integration

```typescript
// convex/imageProcessing.ts
"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";

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
      timing: result.timing,
    };
  },
});
```

## API Reference

### Query Parameters

| Parameter  | Type    | Default  | Description                               |
| ---------- | ------- | -------- | ----------------------------------------- |
| `url`      | string  | required | Source image URL (JPEG or PNG)            |
| `maxWidth` | number  | none     | Max output width (maintains aspect ratio) |
| `quality`  | number  | 80       | WebP quality (1-100)                      |
| `json`     | boolean | false    | Return JSON response with metadata        |

### Response (JSON mode)

```json
{
  "data": "base64-encoded-webp-data",
  "mimeType": "image/webp",
  "size": 8678,
  "originalWidth": 800,
  "originalHeight": 531,
  "width": 400,
  "height": 266,
  "timing": { "total": 67, "fetch": 45, "decode": 5, "resize": 8, "encode": 9 }
}
```

### Response (Binary mode)

When `json=false` (default), returns raw WebP binary with headers:

- `Content-Type: image/webp`
- `X-Timing-Total: 67ms`
- `X-Original-Size: 45678`
- `X-WebP-Size: 8678`
- `X-Original-Dimensions: 800x531`
- `X-Output-Dimensions: 400x266`

## Performance

| Metric          | Value                                   |
| --------------- | --------------------------------------- |
| Processing time | ~20-50ms (decode + resize + encode)     |
| Total latency   | Depends on source image fetch time      |
| WASM            | SIMD-optimized, bundled (no cold start) |
| Worker startup  | ~16ms                                   |

## Troubleshooting

### 401 Unauthorized

- Verify `WEBP_API_SECRET` is set in both Cloudflare and Convex
- Check the secret values match exactly
- Ensure the Authorization header format is `Bearer <secret>`

### 500 Error - Unsupported image type

The worker only supports JPEG and PNG input. Check the source URL returns a valid image with correct `Content-Type` header.

### Timeout errors

Large source images or slow source servers can cause timeouts. Consider:

- Using smaller source images
- Hosting source images on a fast CDN
- Increasing Cloudflare Worker timeout (paid plans)

## Comparison with Pure Convex Pattern

| Aspect              | Pure Convex    | Cloudflare Worker                |
| ------------------- | -------------- | -------------------------------- |
| Setup complexity    | Lower          | Higher                           |
| Cold start          | ~500ms         | ~16ms                            |
| Processing speed    | ~100-200ms     | ~20-50ms                         |
| SIMD optimization   | No             | Yes                              |
| External dependency | CDN for WASM   | Cloudflare account               |
| Cost                | Convex compute | CF Workers (free tier available) |

## Next Steps

- [WebP Conversion - Pure Convex Pattern](./webp-pure-convex.md) - Simpler alternative
- [Setting Up R2](./setup-r2.md) - Store converted images in R2
