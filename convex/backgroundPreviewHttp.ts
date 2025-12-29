/**
 * Background Preview HTTP Handler
 *
 * Receives MP4 + WebP previews from FFmpeg worker after video processing.
 * Stores them in {bookPath}/background-thumbnails/ folder.
 */

import { httpAction } from "./_generated/server";
import { internal, components } from "./_generated/api";

function getR2Config() {
  if (!process.env.R2_BUCKET) return undefined;
  return {
    R2_BUCKET: process.env.R2_BUCKET,
    R2_ENDPOINT: process.env.R2_ENDPOINT!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
  };
}

export const uploadBackgroundPreview = httpAction(async (ctx, request) => {
  // 1. Verify secret
  const authHeader = request.headers.get("Authorization");
  const expectedSecret = process.env.PREVIEW_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error("[upload-background-preview] PREVIEW_WEBHOOK_SECRET not configured");
    return new Response("Server configuration error", { status: 500 });
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    console.error("[upload-background-preview] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 2. Parse multipart form data
    const formData = await request.formData();
    const mp4Blob = formData.get("mp4") as Blob | null;
    const webpBlob = formData.get("webp") as Blob | null;
    const bookPath = formData.get("bookPath") as string;
    const fileBasename = formData.get("fileBasename") as string;

    if (!webpBlob || !bookPath || !fileBasename) {
      return new Response("Missing required fields: webp, bookPath, fileBasename", { status: 400 });
    }

    console.log(`[upload-background-preview] Received preview for ${bookPath}/${fileBasename}`);

    const thumbnailsPath = `${bookPath}/background-thumbnails`;
    const baseName = fileBasename.replace(/\.[^.]+$/, "");
    const r2Config = getR2Config();

    // 3. Upload MP4 preview (if provided)
    let previewMp4Basename: string | undefined;
    if (mp4Blob && mp4Blob.size > 0) {
      previewMp4Basename = `${baseName}_preview.mp4`;

      const { intentId, uploadUrl, backend } = await ctx.runMutation(
        components.assetManager.assetManager.startUpload,
        { folderPath: thumbnailsPath, basename: previewMp4Basename, publish: true, r2Config },
      );

      const uploadRes = await fetch(uploadUrl, {
        method: backend === "r2" ? "PUT" : "POST",
        body: mp4Blob,
        headers: { "Content-Type": "video/mp4" },
      });

      if (!uploadRes.ok) throw new Error(`MP4 upload failed: ${uploadRes.status}`);

      const uploadResponse = backend === "convex" ? await uploadRes.json() : undefined;
      await ctx.runMutation(components.assetManager.assetManager.finishUpload, {
        intentId,
        uploadResponse,
        r2Config,
        size: mp4Blob.size,
        contentType: "video/mp4",
      });
    }

    // 4. Upload WebP thumbnail
    const previewWebpBasename = `${baseName}_preview.webp`;
    const {
      intentId: webpIntentId,
      uploadUrl: webpUploadUrl,
      backend: webpBackend,
    } = await ctx.runMutation(components.assetManager.assetManager.startUpload, {
      folderPath: thumbnailsPath,
      basename: previewWebpBasename,
      publish: true,
      r2Config,
    });

    const webpUploadRes = await fetch(webpUploadUrl, {
      method: webpBackend === "r2" ? "PUT" : "POST",
      body: webpBlob,
      headers: { "Content-Type": "image/webp" },
    });

    if (!webpUploadRes.ok) throw new Error(`WebP upload failed: ${webpUploadRes.status}`);

    const webpUploadResponse = webpBackend === "convex" ? await webpUploadRes.json() : undefined;
    await ctx.runMutation(components.assetManager.assetManager.finishUpload, {
      intentId: webpIntentId,
      uploadResponse: webpUploadResponse,
      r2Config,
      size: webpBlob.size,
      contentType: "image/webp",
    });

    // 5. Extract dominant color from the webp preview
    const webpArrayBuffer = await webpBlob.arrayBuffer();
    const webpBase64 = btoa(String.fromCharCode(...new Uint8Array(webpArrayBuffer)));
    const colorResult = await ctx.runAction(internal.imageProcessing.extractDominantColor, {
      base64Data: webpBase64,
    });

    // 6. Update metadata table
    await ctx.runMutation(internal.backgroundMetadata.updateStatus, {
      bookPath,
      fileBasename,
      status: "completed",
      previewMp4Basename,
      previewWebpBasename,
    });

    // 7. Update cues with detected colors (only if not already set)
    const colorUpdateResult = await ctx.runMutation(
      internal.backgroundCues.updateColorsForFileInternal,
      {
        bookPath,
        fileBasename,
        backgroundColor: colorResult.backgroundColor,
        textColor: colorResult.textColor,
      },
    );

    console.log(
      `[upload-background-preview] Completed for ${fileBasename}, colors: ${colorResult.backgroundColor} (updated ${colorUpdateResult.updated}/${colorUpdateResult.total} cues)`,
    );
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[upload-background-preview] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
