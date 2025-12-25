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
import { query } from "./_generated/server";
import { components } from "./_generated/api";

// =============================================================================
// Book Queries
// =============================================================================

/**
 * List all books (folders under "books/").
 * Returns book metadata from folder.extra.
 */
export const listBooks = query({
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
export const getBookMetadata = query({
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
export const listCharacters = query({
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
export const getCharacterBundle = query({
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

    // Build bundle with typed asset references
    const bundle: {
      path: string;
      slug: string;
      name: string;
      extra: unknown;
      avatar?: { url: string; versionId: string; contentType?: string };
      avatarLarge?: { url: string; versionId: string; contentType?: string };
      speaks?: { url: string; versionId: string; contentType?: string };
      listens?: { url: string; versionId: string; contentType?: string };
    } = {
      path: folder.path,
      slug: folder.path.split("/").pop()!,
      name: folder.name,
      extra: folder.extra,
    };

    // Match assets to bundle slots
    for (const file of files) {
      const basename = file.basename.toLowerCase();
      const assetInfo = {
        url: file.url,
        versionId: file.versionId as string,
        contentType: file.contentType,
      };

      if (basename.startsWith("avatar-large.")) {
        bundle.avatarLarge = assetInfo;
      } else if (basename.startsWith("avatar.")) {
        bundle.avatar = assetInfo;
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
export const listChapters = query({
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
        versionId: file.versionId as string,
        contentType: file.contentType,
        size: file.size,
        publishedAt: file.publishedAt,
        extra: asset?.extra,
        // Extract chapter number for sorting
        chapterNumber: (asset?.extra as { chapterNumber?: number })?.chapterNumber ?? 0,
        title: (asset?.extra as { title?: string })?.title,
      };
    });

    // Sort by chapter number
    return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  },
});

// =============================================================================
// Compiled Chapter HTML Queries
// =============================================================================

/**
 * List compiled chapter HTML for a book, sorted by chapter number.
 */
export const listChapterHtml = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const htmlPath = `${bookPath}/chapters-html`;

    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: htmlPath },
    );

    const assets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: htmlPath },
    );

    const chapters = files.map((file) => {
      const asset = assets.find((a) => a.basename === file.basename);
      const extra = asset?.extra as
        | {
            chapterNumber?: number;
            title?: string;
            sourceVersionId?: string;
            paragraphCount?: number;
          }
        | undefined;

      return {
        path: `${htmlPath}/${file.basename}`,
        basename: file.basename,
        url: file.url,
        versionId: file.versionId as string,
        contentType: file.contentType,
        size: file.size,
        publishedAt: file.publishedAt,
        chapterNumber: extra?.chapterNumber ?? extractChapterNumber(file.basename),
        title: extra?.title,
        sourceVersionId: extra?.sourceVersionId,
        paragraphCount: extra?.paragraphCount,
      };
    });

    return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  },
});

/**
 * List per-chapter character data fragments for a book.
 */
export const listCharacterDataFragments = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const dataPath = `${bookPath}/characters-data`;

    const files = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath: dataPath },
    );

    const assets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: dataPath },
    );

    const jsonFiles = files.filter((file) => file.basename.endsWith(".json"));
    const selectedFiles =
      jsonFiles.length > 0
        ? jsonFiles
        : files.filter(
            (file) => file.basename.endsWith(".json") || file.basename.endsWith(".html"),
          );
    const selectedBasenames = new Set(selectedFiles.map((file) => file.basename));
    const assetByBasename = new Map(
      assets
        .filter((asset) => selectedBasenames.has(asset.basename))
        .map((asset) => [asset.basename, asset]),
    );

    const fragments = selectedFiles.map((file) => {
      const asset = assetByBasename.get(file.basename);
      const extra = asset?.extra as
        | { chapterNumber?: number; sourceVersionId?: string }
        | undefined;

      return {
        path: `${dataPath}/${file.basename}`,
        basename: file.basename,
        url: file.url,
        versionId: file.versionId as string,
        contentType: file.contentType,
        size: file.size,
        publishedAt: file.publishedAt,
        chapterNumber: extra?.chapterNumber ?? extractChapterNumber(file.basename),
        sourceVersionId: extra?.sourceVersionId,
      };
    });

    return fragments.sort((a, b) => a.chapterNumber - b.chapterNumber);
  },
});

// =============================================================================
// Background Queries
// =============================================================================

/**
 * List all backgrounds for a book.
 * Sorted by chapter, then paragraph.
 */
export const listBackgrounds = query({
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
// Music Queries
// =============================================================================

/**
 * List all music tracks for a book.
 * Sorted by chapter, then paragraph.
 */
export const listMusic = query({
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

// =============================================================================
// Draft-Aware Queries (for Live Mode)
// =============================================================================

/**
 * List chapters preferring draft over published.
 * For live preview mode - shows latest version being edited.
 */
export const listChaptersWithDrafts = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const chaptersPath = `${bookPath}/chapters`;

    // Get all assets (not just published)
    const assets = await ctx.runQuery(components.assetManager.assetManager.listAssets, {
      folderPath: chaptersPath,
    });

    // For each asset, get the best version (draft > published)
    const chapters = await Promise.all(
      assets.map(async (asset) => {
        const versions = await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
          folderPath: chaptersPath,
          basename: asset.basename,
        });

        // Prefer draft, then published, then latest
        const draftVersion = versions.find((v) => v.state === "draft");
        const publishedVersion = versions.find((v) => v.state === "published");
        const bestVersion = draftVersion || publishedVersion || versions[0];

        if (!bestVersion) return null;

        // Get URL for the version
        const urlInfo = await ctx.runQuery(
          components.assetManager.assetFsHttp.getVersionPreviewUrl,
          { versionId: bestVersion._id },
        );

        const extra = asset.extra as { chapterNumber?: number; title?: string } | undefined;

        return {
          path: `${chaptersPath}/${asset.basename}`,
          basename: asset.basename,
          versionId: bestVersion._id,
          state: bestVersion.state,
          url: urlInfo?.url,
          contentType: urlInfo?.contentType,
          chapterNumber: extra?.chapterNumber ?? extractChapterNumber(asset.basename),
          title: extra?.title,
          hasDraft: !!draftVersion,
        };
      }),
    );

    // Filter nulls and sort by chapter number
    return chapters
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
  },
});

/**
 * List backgrounds preferring draft over published.
 */
export const listBackgroundsWithDrafts = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const backgroundsPath = `${bookPath}/backgrounds`;

    const assets = await ctx.runQuery(components.assetManager.assetManager.listAssets, {
      folderPath: backgroundsPath,
    });

    const backgrounds = await Promise.all(
      assets.map(async (asset) => {
        const versions = await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
          folderPath: backgroundsPath,
          basename: asset.basename,
        });

        const draftVersion = versions.find((v) => v.state === "draft");
        const publishedVersion = versions.find((v) => v.state === "published");
        const bestVersion = draftVersion || publishedVersion || versions[0];

        if (!bestVersion) return null;

        const urlInfo = await ctx.runQuery(
          components.assetManager.assetFsHttp.getVersionPreviewUrl,
          { versionId: bestVersion._id },
        );

        // Extra metadata is on the version, not the asset
        const extra = bestVersion.extra as
          | { chapter?: number; paragraph?: number; backgroundColor?: string; textColor?: string }
          | undefined;

        return {
          path: `${backgroundsPath}/${asset.basename}`,
          basename: asset.basename,
          versionId: bestVersion._id,
          state: bestVersion.state,
          url: urlInfo?.url,
          contentType: urlInfo?.contentType,
          chapter: extra?.chapter ?? 0,
          paragraph: extra?.paragraph ?? 0,
          backgroundColor: extra?.backgroundColor,
          textColor: extra?.textColor,
          hasDraft: !!draftVersion,
        };
      }),
    );

    return backgrounds
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => {
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.paragraph - b.paragraph;
      });
  },
});

/**
 * List music preferring draft over published.
 */
export const listMusicWithDrafts = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const musicPath = `${bookPath}/music`;

    const assets = await ctx.runQuery(components.assetManager.assetManager.listAssets, {
      folderPath: musicPath,
    });

    const music = await Promise.all(
      assets.map(async (asset) => {
        const versions = await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
          folderPath: musicPath,
          basename: asset.basename,
        });

        const draftVersion = versions.find((v) => v.state === "draft");
        const publishedVersion = versions.find((v) => v.state === "published");
        const bestVersion = draftVersion || publishedVersion || versions[0];

        if (!bestVersion) return null;

        const urlInfo = await ctx.runQuery(
          components.assetManager.assetFsHttp.getVersionPreviewUrl,
          { versionId: bestVersion._id },
        );

        // Extra metadata is on the version, not the asset
        const extra = bestVersion.extra as { chapter?: number; paragraph?: number } | undefined;

        return {
          path: `${musicPath}/${asset.basename}`,
          basename: asset.basename,
          versionId: bestVersion._id,
          state: bestVersion.state,
          url: urlInfo?.url,
          contentType: urlInfo?.contentType,
          chapter: extra?.chapter ?? 0,
          paragraph: extra?.paragraph ?? 0,
          hasDraft: !!draftVersion,
        };
      }),
    );

    return music
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => {
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.paragraph - b.paragraph;
      });
  },
});

/**
 * Get character bundles with draft-aware asset URLs.
 */
export const listCharacterBundlesWithDrafts = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const charactersPath = `${bookPath}/characters`;

    const characterFolders = await ctx.runQuery(components.assetManager.assetManager.listFolders, {
      parentPath: charactersPath,
    });

    const bundles = await Promise.all(
      characterFolders.map(async (folder) => {
        // Get assets in this character folder
        const assets = await ctx.runQuery(components.assetManager.assetManager.listAssets, {
          folderPath: folder.path,
        });

        const bundle: {
          path: string;
          slug: string;
          name: string;
          extra: unknown;
          avatar?: { url: string; versionId: string; contentType?: string };
          avatarLarge?: { url: string; versionId: string; contentType?: string };
          speaks?: { url: string; versionId: string; contentType?: string };
          listens?: { url: string; versionId: string; contentType?: string };
        } = {
          path: folder.path,
          slug: folder.path.split("/").pop()!,
          name: folder.name,
          extra: folder.extra,
        };

        // Get best version for each asset type
        for (const asset of assets) {
          const versions = await ctx.runQuery(
            components.assetManager.assetManager.getAssetVersions,
            { folderPath: folder.path, basename: asset.basename },
          );

          const draftVersion = versions.find((v) => v.state === "draft");
          const publishedVersion = versions.find((v) => v.state === "published");
          const bestVersion = draftVersion || publishedVersion || versions[0];

          if (!bestVersion) continue;

          const urlInfo = await ctx.runQuery(
            components.assetManager.assetFsHttp.getVersionPreviewUrl,
            { versionId: bestVersion._id },
          );

          if (!urlInfo?.url) continue;

          const assetInfo = {
            url: urlInfo.url,
            versionId: bestVersion._id,
            contentType: urlInfo.contentType,
          };

          const basename = asset.basename.toLowerCase();
          if (basename.startsWith("avatar-large.")) {
            bundle.avatarLarge = assetInfo;
          } else if (basename.startsWith("avatar.")) {
            bundle.avatar = assetInfo;
          } else if (basename.startsWith("speaks.")) {
            bundle.speaks = assetInfo;
          } else if (basename.startsWith("listens.")) {
            bundle.listens = assetInfo;
          }
        }

        return bundle;
      }),
    );

    return bundles;
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
export const getBookStats = query({
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
export const listAudiobookTracks = query({
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
export const listCutScenes = query({
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
export const listNotes = query({
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
export const listVariants = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return variants.map((v) => ({ id: v.variantId, simplifications: v.simplifications }));
  },
});
