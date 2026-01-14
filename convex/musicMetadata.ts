/**
 * Music Metadata Extraction
 *
 * Extracts ID3 tags (cover art, title, artist, duration) from MP3 files
 * and stores them in the musicFileMetadata table. Cover art is uploaded
 * to a separate music-covers/ folder.
 */

import { v } from "convex/values";
import { internal, components } from "./_generated/api";
import { publicQuery, bookMutation, internalAction, internalMutation } from "./functions";
import * as mm from "music-metadata";

// =============================================================================
// Queries
// =============================================================================

/**
 * Get metadata for a specific music file.
 */
export const getByFile = publicQuery({
  args: { bookPath: v.string(), fileBasename: v.string() },
  handler: async (ctx, { bookPath, fileBasename }) => {
    const metadata = await ctx.db
      .query("musicFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath).eq("fileBasename", fileBasename))
      .first();

    if (!metadata || !metadata.coverBasename) {
      return metadata;
    }

    // Get cover URL
    const coverFiles = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/music-covers` },
    );
    const coverFile = coverFiles.find((f) => f.basename === metadata.coverBasename);

    return { ...metadata, coverUrl: coverFile?.url };
  },
});

/**
 * List all metadata for a book (for batch loading).
 */
export const listByBook = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const allMetadata = await ctx.db
      .query("musicFileMetadata")
      .withIndex("by_book_file", (q) => q.eq("bookPath", bookPath))
      .collect();

    if (allMetadata.length === 0) {
      return [];
    }

    // Get all cover URLs in one query
    const coverFiles = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/music-covers` },
    );
    const coverMap = new Map(coverFiles.map((f) => [f.basename, f.url]));

    return allMetadata.map((m) => ({
      ...m,
      coverUrl: m.coverBasename ? coverMap.get(m.coverBasename) : undefined,
    }));
  },
});

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Upsert metadata for a music file.
 */
export const upsertMetadata = internalMutation({
  args: {
    bookPath: v.string(),
    fileBasename: v.string(),
    coverBasename: v.optional(v.string()),
    title: v.optional(v.string()),
    artist: v.optional(v.string()),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("musicFileMetadata")
      .withIndex("by_book_file", (q) =>
        q.eq("bookPath", args.bookPath).eq("fileBasename", args.fileBasename),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        coverBasename: args.coverBasename,
        title: args.title,
        artist: args.artist,
        duration: args.duration,
        extractedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("musicFileMetadata", {
        bookPath: args.bookPath,
        fileBasename: args.fileBasename,
        coverBasename: args.coverBasename,
        title: args.title,
        artist: args.artist,
        duration: args.duration,
        extractedAt: Date.now(),
      });
    }
  },
});

// =============================================================================
// Internal Action: Extract Metadata
// =============================================================================

/**
 * Extract metadata from an MP3 file.
 * Scheduled after upload to music/ folder.
 */
export const extractFromFile = internalAction({
  args: { bookPath: v.string(), fileBasename: v.string() },
  handler: async (ctx, { bookPath, fileBasename }) => {
    console.log(`[musicMetadata] Extracting metadata from ${bookPath}/music/${fileBasename}`);

    try {
      // Get the file URL from asset-manager
      const files = await ctx.runQuery(
        components.assetManager.assetManager.listPublishedFilesInFolder,
        { folderPath: `${bookPath}/music` },
      );
      const file = files.find((f) => f.basename === fileBasename);

      if (!file?.url) {
        console.warn(`[musicMetadata] File not found or not published: ${fileBasename}`);
        return;
      }

      // Fetch first 512KB of the file (ID3v2 tags are at the start)
      const response = await fetch(file.url, { headers: { Range: "bytes=0-524287" } });

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Parse metadata
      const metadata = await mm.parseBuffer(uint8Array, { mimeType: "audio/mpeg" });

      const title = metadata.common.title;
      const artist = metadata.common.artist;
      const duration = metadata.format.duration;
      const picture = metadata.common.picture?.[0];

      console.log(
        `[musicMetadata] Parsed: title="${title}", artist="${artist}", duration=${duration}, hasCover=${!!picture}`,
      );

      let coverBasename: string | undefined;

      // If cover art found, upload it
      if (picture?.data && picture.data.length > 0) {
        // Determine file extension from mime type
        const mimeType = picture.format || "image/jpeg";
        const ext = mimeType.includes("png") ? "png" : "jpg";
        coverBasename = fileBasename.replace(/\.[^.]+$/, `.${ext}`);

        // Convert to Uint8Array if needed
        const imageData = new Uint8Array(picture.data);
        const blob = new Blob([imageData], { type: mimeType });

        // Upload to music-covers/ folder
        const coversPath = `${bookPath}/music-covers`;

        const { intentId, uploadUrl, backend } = await ctx.runMutation(
          internal.generateUploadUrl.startUploadInternal,
          { folderPath: coversPath, basename: coverBasename },
        );

        const uploadRes = await fetch(uploadUrl, {
          method: backend === "r2" ? "PUT" : "POST",
          body: blob,
          headers: { "Content-Type": mimeType },
        });

        if (!uploadRes.ok) {
          throw new Error(`Cover upload failed: ${uploadRes.status}`);
        }

        const uploadResponse = backend === "convex" ? await uploadRes.json() : undefined;

        await ctx.runMutation(internal.generateUploadUrl.finishUploadInternal, {
          intentId,
          uploadResponse,
          size: blob.size,
          contentType: mimeType,
        });

        console.log(`[musicMetadata] Uploaded cover: ${coversPath}/${coverBasename}`);
      }

      // Store metadata
      await ctx.runMutation(internal.musicMetadata.upsertMetadata, {
        bookPath,
        fileBasename,
        coverBasename,
        title,
        artist,
        duration,
      });

      console.log(`[musicMetadata] Metadata saved for ${fileBasename}`);
    } catch (error) {
      console.error(`[musicMetadata] Failed to extract metadata from ${fileBasename}:`, error);
      // Don't throw - we don't want to retry failed extractions
    }
  },
});

// =============================================================================
// Manual Trigger (for existing files)
// =============================================================================

/**
 * Manually trigger metadata extraction for a file.
 * Useful for re-extracting or processing existing files.
 */
export const triggerExtraction = bookMutation({
  args: { fileBasename: v.string() },
  handler: async (ctx, { fileBasename }) => {
    const bookPath = ctx.bookPath;
    await ctx.scheduler.runAfter(0, internal.musicMetadata.extractFromFile, {
      bookPath,
      fileBasename,
    });
    return { scheduled: true };
  },
});

/**
 * Trigger extraction for all music files in a book.
 */
export const triggerExtractionForBook = bookMutation({
  args: {},
  handler: async (ctx) => {
    const bookPath = ctx.bookPath;
    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: `${bookPath}/music` },
    );

    const mp3Files = files.filter((f) => f.basename.toLowerCase().endsWith(".mp3"));

    for (const file of mp3Files) {
      await ctx.scheduler.runAfter(0, internal.musicMetadata.extractFromFile, {
        bookPath,
        fileBasename: file.basename,
      });
    }

    return { scheduled: mp3Files.length };
  },
});
