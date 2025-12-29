import decodeJpeg, { init as initJpegDec } from "@jsquash/jpeg/decode";
import decodePng, { init as initPngDec } from "@jsquash/png/decode";
import decodeWebp, { init as initWebpDec } from "@jsquash/webp/decode";
import encodeWebp, { init as initWebpEnc } from "@jsquash/webp/encode";
import resize, { initResize } from "@jsquash/resize";

// @ts-expect-error - WASM module imports
import JPEG_DEC_WASM from "../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
// @ts-expect-error - WASM module imports
import PNG_DEC_WASM from "../../../node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
// @ts-expect-error - WASM module imports
import WEBP_DEC_WASM from "../../../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm";
// @ts-expect-error - WASM module imports (SIMD for better perf)
import WEBP_ENC_WASM from "../../../node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm";
// @ts-expect-error - WASM module imports
import RESIZE_WASM from "../../../node_modules/@jsquash/resize/lib/resize/squoosh_resize_bg.wasm";

function extractDominantColor(imageData: ImageData): { backgroundColor: string; textColor: string } {
  const { data, width, height } = imageData;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 20));

  let totalR = 0,
    totalG = 0,
    totalB = 0,
    sampleCount = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      totalR += data[idx];
      totalG += data[idx + 1];
      totalB += data[idx + 2];
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

  return { backgroundColor, textColor };
}

interface Env {
  WEBP_API_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const authHeader = request.headers.get("Authorization");
    const expectedToken = `Bearer ${env.WEBP_API_SECRET}`;

    if (!authHeader || authHeader !== expectedToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const startTime = Date.now();

    const url = new URL(request.url);
    const sourceUrl = url.searchParams.get("url");
    const maxWidth = url.searchParams.get("maxWidth") ? parseInt(url.searchParams.get("maxWidth")!, 10) : null;
    const quality = parseInt(url.searchParams.get("quality") || "80", 10);
    const extractColors = url.searchParams.get("extractColors") === "true";

    if (!sourceUrl) {
      return new Response(JSON.stringify({ error: "Missing ?url= parameter" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    try {
      const imageResponse = await fetch(sourceUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      const fetchTime = Date.now();

      const contentType = imageResponse.headers.get("content-type") || "";
      const buffer = await imageResponse.arrayBuffer();

      let imageData: ImageData;
      if (contentType.includes("jpeg") || contentType.includes("jpg")) {
        await initJpegDec(JPEG_DEC_WASM);
        imageData = await decodeJpeg(buffer);
      } else if (contentType.includes("png")) {
        await initPngDec(PNG_DEC_WASM);
        imageData = await decodePng(buffer);
      } else if (contentType.includes("webp")) {
        await initWebpDec(WEBP_DEC_WASM);
        imageData = await decodeWebp(buffer);
      } else {
        throw new Error(`Unsupported image type: ${contentType}`);
      }
      const decodeTime = Date.now();

      const originalWidth = imageData.width;
      const originalHeight = imageData.height;

      if (maxWidth && imageData.width > maxWidth) {
        await initResize(RESIZE_WASM);
        const scale = maxWidth / imageData.width;
        const newHeight = Math.round(imageData.height * scale);
        imageData = await resize(imageData, { width: maxWidth, height: newHeight });
      }
      const resizeTime = Date.now();

      await initWebpEnc(WEBP_ENC_WASM);
      const webpBuffer = await encodeWebp(imageData, { quality });
      const encodeTime = Date.now();

      const returnJson = url.searchParams.get("json") === "true";

      if (returnJson) {
        const colors = extractColors ? extractDominantColor(imageData) : undefined;
        return new Response(
          JSON.stringify({
            data: btoa(String.fromCharCode(...new Uint8Array(webpBuffer))),
            mimeType: "image/webp",
            size: webpBuffer.byteLength,
            originalWidth,
            originalHeight,
            width: imageData.width,
            height: imageData.height,
            ...(colors && { backgroundColor: colors.backgroundColor, textColor: colors.textColor }),
            timing: {
              total: encodeTime - startTime,
              fetch: fetchTime - startTime,
              decode: decodeTime - fetchTime,
              resize: resizeTime - decodeTime,
              encode: encodeTime - resizeTime,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(webpBuffer, {
        headers: {
          "Content-Type": "image/webp",
          "X-Timing-Total": `${encodeTime - startTime}ms`,
          "X-Original-Size": `${buffer.byteLength}`,
          "X-WebP-Size": `${webpBuffer.byteLength}`,
          "X-Original-Dimensions": `${originalWidth}x${originalHeight}`,
          "X-Output-Dimensions": `${imageData.width}x${imageData.height}`,
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  },
};
