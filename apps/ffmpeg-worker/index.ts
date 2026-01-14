// This is a run-once job, not an HTTP server.
// It reads job params from environment variables, processes the video,
// sends the result to Convex webhook, then exits.

async function main() {
  const sourceUrl = Bun.env.SOURCE_URL;
  const bookPath = Bun.env.BOOK_PATH;
  const fileBasename = Bun.env.FILE_BASENAME;
  const webhookUrl = Bun.env.CONVEX_SITE_URL;
  const webhookSecret = Bun.env.PREVIEW_WEBHOOK_SECRET;

  if (!sourceUrl || !bookPath || !fileBasename) {
    console.error("❌ Missing required env vars: SOURCE_URL, BOOK_PATH, FILE_BASENAME");
    process.exit(1);
  }
  if (!webhookUrl || !webhookSecret) {
    console.error("❌ Missing required env vars: CONVEX_SITE_URL, PREVIEW_WEBHOOK_SECRET");
    process.exit(1);
  }

  const baseName = fileBasename.replace(/\.[^.]+$/, "");
  console.log(`🎬 Starting job for: ${bookPath}/${fileBasename}`);

  try {
    // Download source file to /tmp
    const response = await fetch(sourceUrl);
    const tempInput = `/tmp/input_${baseName}.mp4`;
    await Bun.write(tempInput, await response.arrayBuffer());

    const mp4Output = `/tmp/${baseName}_preview.mp4`;
    const webpOutput = `/tmp/${baseName}_preview.webp`;

    // Run FFmpeg: scale to 426x240, 24fps, H.264, no audio
    const scaleFilter = `scale=426:240:force_original_aspect_ratio=decrease,pad=426:240:(ow-iw)/2:(oh-ih)/2`;

    Bun.spawnSync([
      "ffmpeg",
      "-y",
      "-i",
      tempInput,
      "-vf",
      scaleFilter,
      "-r",
      "24",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      mp4Output,
    ]);

    // Extract first frame as WebP thumbnail
    Bun.spawnSync([
      "ffmpeg",
      "-y",
      "-i",
      mp4Output,
      "-vf",
      "select=eq(n\\,0)",
      "-frames:v",
      "1",
      "-vcodec",
      "libwebp",
      "-quality",
      "30",
      webpOutput,
    ]);

    // POST to Convex HTTP endpoint with auth
    const formData = new FormData();
    formData.append(
      "mp4",
      new Blob([await Bun.file(mp4Output).arrayBuffer()]),
      `${baseName}_preview.mp4`,
    );
    formData.append(
      "webp",
      new Blob([await Bun.file(webpOutput).arrayBuffer()]),
      `${baseName}_preview.webp`,
    );
    formData.append("bookPath", bookPath);
    formData.append("fileBasename", fileBasename);

    console.log(`🚀 POSTing to ${webhookUrl}/upload-background-preview`);
    const res = await fetch(`${webhookUrl}/upload-background-preview`, {
      method: "POST",
      body: formData,
      headers: { Authorization: `Bearer ${webhookSecret}` },
    });

    if (!res.ok) {
      throw new Error(`Webhook failed: ${res.status} ${await res.text()}`);
    }

    // Cleanup temp files
    await Bun.file(tempInput).delete?.();
    await Bun.file(mp4Output).delete?.();
    await Bun.file(webpOutput).delete?.();

    console.log(`✅ Job complete for ${bookPath}/${fileBasename}`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ Job failed:`, err);
    process.exit(1);
  }
}

main();
