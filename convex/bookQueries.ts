/**
 * Book-Specific Queries
 *
 * These queries provide book-domain abstractions on top of the asset-manager component.
 * They handle the folder structure conventions and return typed data for UI components.
 *
 * Folder Structure:
 *   books/
 *     {book-slug}/                   <- Book folder with BookFolderExtra
 *       characters/
 *         {character-slug}/          <- Character folder with CharacterFolderExtra
 *           avatar.png
 *           speaks.mp4
 *           listens.mp4
 *       chapters/
 *         chapter-1.xml              <- Asset with ChapterExtra in version.extra
 *       backgrounds/
 *         ch1-p0.mp4                 <- Asset with BackgroundExtra
 *       music/
 *         scene1.mp3                 <- Asset with MusicExtra
 */

import { v } from "convex/values";
import { publicQuery, adminQuery } from "./functions";
import { components } from "./_generated/api";

// =============================================================================
// Book Queries
// =============================================================================

/**
 * List all books (folders under "books/").
 * Returns book metadata from folder.extra.
 */
export const listBooks = adminQuery({
  args: {},
  handler: async (ctx) => {
    const folders = await ctx.runQuery(components.assetManager.assetManager.listFolders, {
      parentPath: "books",
    });

    return folders.map((folder) => ({
      path: folder.path,
      slug: folder.path.split("/").pop()!,
      name: folder.name,
      extra: folder.extra,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    }));
  },
});

/**
 * Get metadata for a specific book.
 */
export const getBookMetadata = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const folder = await ctx.runQuery(components.assetManager.assetManager.getFolder, {
      path: bookPath,
    });

    if (!folder) return null;

    return {
      path: folder.path,
      slug: folder.path.split("/").pop()!,
      name: folder.name,
      extra: folder.extra,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  },
});

// =============================================================================
// Character Queries
// =============================================================================

/**
 * List all characters for a book.
 * Returns character folders with their metadata.
 */
export const listCharacters = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const charactersPath = `${bookPath}/characters`;

    const folders = await ctx.runQuery(components.assetManager.assetManager.listFolders, {
      parentPath: charactersPath,
    });

    return folders.map((folder) => ({
      path: folder.path,
      slug: folder.path.split("/").pop()!,
      name: folder.name,
      extra: folder.extra,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    }));
  },
});

/**
 * Get a character bundle (metadata + all asset URLs).
 * Returns the character's folder.extra plus URLs for avatar, speaks, listens.
 */
export const getCharacterBundle = publicQuery({
  args: { characterPath: v.string() },
  handler: async (ctx, { characterPath }) => {
    // Get character folder metadata
    const folder = await ctx.runQuery(components.assetManager.assetManager.getFolder, {
      path: characterPath,
    });

    if (!folder) return null;

    // Get published files in the character folder
    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: characterPath },
    );

    type AssetInfo = { url: string; versionId: string; contentType?: string; publishedAt?: number };

    const bundle: {
      path: string;
      slug: string;
      name: string;
      extra: unknown;
      avatar?: AssetInfo;
      avatarLarge?: AssetInfo;
      speaks?: AssetInfo;
      listens?: AssetInfo;
    } = {
      path: folder.path,
      slug: folder.path.split("/").pop()!,
      name: folder.name,
      extra: folder.extra,
    };

    for (const file of files) {
      const basename = file.basename.toLowerCase();
      const assetInfo: AssetInfo = {
        url: file.url,
        versionId: file.versionId,
        contentType: file.contentType,
        publishedAt: file.publishedAt,
      };

      if (basename.startsWith("avatar-large.")) {
        bundle.avatarLarge = assetInfo;
      } else if (basename.startsWith("avatar.")) {
        const isWebp = basename === "avatar.webp";
        const existingIsWebp = bundle.avatar?.contentType === "image/webp";
        const isNewer = (assetInfo.publishedAt ?? 0) > (bundle.avatar?.publishedAt ?? 0);

        if (!bundle.avatar || isWebp || (!existingIsWebp && isNewer)) {
          bundle.avatar = assetInfo;
        }
      } else if (basename.startsWith("speaks.")) {
        bundle.speaks = assetInfo;
      } else if (basename.startsWith("listens.")) {
        bundle.listens = assetInfo;
      }
    }

    return bundle;
  },
});

// =============================================================================
// Chapter Queries
// =============================================================================

/**
 * List all chapters for a book, sorted by chapter number.
 * Chapter number comes from version.extra.chapterNumber.
 */
export const listChapters = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const chaptersPath = `${bookPath}/chapters`;

    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: chaptersPath },
    );

    // We need the version.extra for chapter metadata
    // listPublishedFilesInFolder doesn't return extra, so we need to use listPublishedAssetsInFolder
    const assets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: chaptersPath },
    );

    // Join files with assets to get both URLs and extra
    const chapters = files.map((file) => {
      const asset = assets.find((a) => a.basename === file.basename);
      return {
        path: `${chaptersPath}/${file.basename}`,
        basename: file.basename,
        url: file.url,
        versionId: file.versionId,
        contentType: file.contentType,
        size: file.size,
        publishedAt: file.publishedAt,
        extra: asset?.extra,
        // Extract chapter number for sorting
        chapterNumber: asset?.extra?.chapterNumber ?? 0,
        title: asset?.extra?.title,
      };
    });

    // Sort by chapter number
    return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  },
});

// =============================================================================
// Compiled Chapter HTML Queries
// =============================================================================

// =============================================================================
// V2 Format Queries (combined HTML + occurrences)
// =============================================================================

export const listCompiledChapters = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const compiledPath = `${bookPath}/chapters-compiled`;

    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: compiledPath },
    );

    if (files.length === 0) return null;

    const assets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: compiledPath },
    );

    const chapters = files.map((file) => {
      const asset = assets.find((a) => a.basename === file.basename);
      const extra = asset?.extra as
        | { chapterNumber?: number; title?: string; paragraphCount?: number }
        | undefined;

      return {
        basename: file.basename,
        url: file.url,
        versionId: file.versionId as string,
        chapterNumber: extra?.chapterNumber ?? extractChapterNumber(file.basename),
        title: extra?.title,
        paragraphCount: extra?.paragraphCount,
      };
    });

    return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  },
});

export const listHtmlSourceChapters = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const sourcePath = `${bookPath}/chapters-source`;

    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: sourcePath },
    );

    if (files.length === 0) return null;

    const assets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: sourcePath },
    );

    const chapters = files.map((file) => {
      const asset = assets.find((a) => a.basename === file.basename);
      const extra = asset?.extra as
        | { chapterNumber?: number; title?: string; paragraphCount?: number; sourceFormat?: string }
        | undefined;

      return {
        basename: file.basename,
        url: file.url,
        versionId: file.versionId as string,
        chapterNumber: extra?.chapterNumber ?? extractChapterNumber(file.basename),
        title: extra?.title,
        paragraphCount: extra?.paragraphCount,
        sourceFormat: extra?.sourceFormat ?? "html",
      };
    });

    return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  },
});

export const getCharacterIndexV2 = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const indexPath = `${bookPath}/characters-v2`;

    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: indexPath },
    );

    const indexFile = files.find((f) => f.basename === "index.json");
    if (!indexFile) return null;

    return { url: indexFile.url, versionId: indexFile.versionId as string };
  },
});

// =============================================================================
// Background Queries
// =============================================================================

/**
 * List all backgrounds for a book.
 * Sorted by chapter, then paragraph.
 */
export const listBackgrounds = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const backgroundsPath = `${bookPath}/backgrounds`;

    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: backgroundsPath },
    );

    const assets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: backgroundsPath },
    );

    const backgrounds = files.map((file) => {
      const asset = assets.find((a) => a.basename === file.basename);
      const extra = asset?.extra as
        | { chapter?: number; paragraph?: number; backgroundColor?: string; textColor?: string }
        | undefined;

      return {
        path: `${backgroundsPath}/${file.basename}`,
        basename: file.basename,
        url: file.url,
        versionId: file.versionId as string,
        contentType: file.contentType,
        size: file.size,
        publishedAt: file.publishedAt,
        extra: asset?.extra,
        // Extract for sorting
        chapter: extra?.chapter ?? 0,
        paragraph: extra?.paragraph ?? 0,
        backgroundColor: extra?.backgroundColor,
        textColor: extra?.textColor,
      };
    });

    // Sort by chapter, then paragraph
    return backgrounds.sort((a, b) => {
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.paragraph - b.paragraph;
    });
  },
});

// =============================================================================
// Figure Queries
// =============================================================================

/**
 * List all figures/images for a book.
 * Returns filename -> URL mapping for use in HTML img src transformation.
 */
export const listFigures = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const figuresPath = `${bookPath}/figures`;

    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: figuresPath },
    );

    return files.map((file) => ({
      filename: file.basename,
      url: file.url,
      contentType: file.contentType,
    }));
  },
});

// =============================================================================
// Music Queries
// =============================================================================

/**
 * List all music tracks for a book.
 * Sorted by chapter, then paragraph.
 */
export const listMusic = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const musicPath = `${bookPath}/music`;

    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: musicPath },
    );

    const assets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: musicPath },
    );

    const music = files.map((file) => {
      const asset = assets.find((a) => a.basename === file.basename);
      const extra = asset?.extra as { chapter?: number; paragraph?: number } | undefined;

      return {
        path: `${musicPath}/${file.basename}`,
        basename: file.basename,
        url: file.url,
        versionId: file.versionId as string,
        contentType: file.contentType,
        size: file.size,
        publishedAt: file.publishedAt,
        extra: asset?.extra,
        // Extract for sorting
        chapter: extra?.chapter ?? 0,
        paragraph: extra?.paragraph ?? 0,
      };
    });

    // Sort by chapter, then paragraph
    return music.sort((a, b) => {
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.paragraph - b.paragraph;
    });
  },
});

/**
 * Get character bundles with asset URLs.
 * Uses bulk query to fetch all folders and assets in a single operation.
 */
export const listCharacterBundles = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const charactersPath = `${bookPath}/characters`;

    const foldersWithAssets = await ctx.runQuery(
      components.assetManager.assetManager.listFoldersWithAssets,
      { parentPath: charactersPath },
    );

    return foldersWithAssets.map(({ folder, assets }) => {
      type AssetInfo = { url: string; versionId: string; contentType?: string };

      const bundle: {
        path: string;
        slug: string;
        name: string;
        extra: unknown;
        avatar?: AssetInfo;
        avatarLarge?: AssetInfo;
        speaks?: AssetInfo;
        listens?: AssetInfo;
      } = {
        path: folder.path,
        slug: folder.path.split("/").pop()!,
        name: folder.name,
        extra: folder.extra,
      };

      for (const asset of assets) {
        const basename = asset.basename.toLowerCase();
        const assetInfo: AssetInfo = {
          url: asset.url,
          versionId: asset.versionId,
          contentType: asset.contentType,
        };

        if (basename.startsWith("avatar-large.")) {
          bundle.avatarLarge = assetInfo;
        } else if (basename.startsWith("avatar.")) {
          const isWebp = basename === "avatar.webp";
          const existingIsWebp = bundle.avatar?.contentType === "image/webp";
          if (!bundle.avatar || isWebp || !existingIsWebp) {
            bundle.avatar = assetInfo;
          }
        } else if (basename.startsWith("speaks.")) {
          bundle.speaks = assetInfo;
        } else if (basename.startsWith("listens.")) {
          bundle.listens = assetInfo;
        }
      }

      return bundle;
    });
  },
});

/**
 * Helper to extract chapter number from filename.
 * Handles: "chapter1.xml", "chapter-1.xml", "01.xml", etc.
 */
function extractChapterNumber(basename: string): number {
  // Try "chapter1" or "chapter-1" pattern
  const chapterMatch = basename.match(/chapter[-_]?(\d+)/i);
  if (chapterMatch) return parseInt(chapterMatch[1], 10);

  // Try leading number pattern "01.xml"
  const numMatch = basename.match(/^(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);

  return 0;
}

// =============================================================================
// Book Stats Query (for dashboard)
// =============================================================================

/**
 * Get summary stats for a book (character count, chapter count, etc.)
 */
export const getBookStats = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    // Count characters
    const characterFolders = await ctx.runQuery(components.assetManager.assetManager.listFolders, {
      parentPath: `${bookPath}/characters`,
    });

    // Count chapters
    const chapterAssets = await ctx.runQuery(components.assetManager.assetManager.listAssets, {
      folderPath: `${bookPath}/chapters`,
    });

    // Count backgrounds
    const backgroundAssets = await ctx.runQuery(components.assetManager.assetManager.listAssets, {
      folderPath: `${bookPath}/backgrounds`,
    });

    // Count music
    const musicAssets = await ctx.runQuery(components.assetManager.assetManager.listAssets, {
      folderPath: `${bookPath}/music`,
    });

    // Count notes
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    // Count variants
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return {
      characterCount: characterFolders.length,
      chapterCount: chapterAssets.length,
      backgroundCount: backgroundAssets.length,
      musicCount: musicAssets.length,
      noteCount: notes.length,
      variantCount: variants.length,
    };
  },
});

// =============================================================================
// Stub Queries (for data not yet in CMS)
// =============================================================================

/**
 * List audiobook tracks for a book.
 * STUB: Returns empty array - audiobook data not yet in CMS.
 */
export const listAudiobookTracks = publicQuery({
  args: { bookPath: v.string() },
  handler: async () => {
    // TODO: Implement when audiobook data is added to CMS
    return [];
  },
});

/**
 * List cut scenes for a book.
 * STUB: Returns empty array - cut scene data not yet in CMS.
 */
export const listCutScenes = publicQuery({
  args: { bookPath: v.string() },
  handler: async () => {
    // TODO: Implement when cut scene data is added to CMS
    return [];
  },
});

/**
 * List notes for a book.
 * Returns all footnotes/annotations for the specified book.
 */
export const listNotes = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return notes.map((n) => ({ id: n.noteId, content: n.content }));
  },
});

/**
 * List text variants for a book.
 * Returns all sentence simplifications for the specified book.
 */
export const listVariants = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return variants.map((v) => ({ id: v.variantId, simplifications: v.simplifications }));
  },
});

// =============================================================================
// Generation Status Queries
// =============================================================================

/**
 * Get the current generation status for a book.
 * Used by player/CMS to show progress and determine what's readable.
 */
export const getGenerationStatus = adminQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const job = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_bookPath", (q) => q.eq("bookPath", bookPath))
      .first();

    if (!job) return null;

    return {
      jobId: job.jobId,
      status: job.status,
      currentStep: job.currentStep,
      steps: job.steps,
      totalChapters: job.totalChapters,
      readyChapters: job.readyChapters,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  },
});

/**
 * List all books currently being generated.
 */
export const listGeneratingBooks = adminQuery({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_status", (q) => q.eq("status", "generating"))
      .collect();

    return jobs.map((job) => ({
      bookPath: job.bookPath,
      bookSlug: job.bookSlug,
      currentStep: job.currentStep,
      totalChapters: job.totalChapters,
      readyChapters: job.readyChapters,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }));
  },
});
