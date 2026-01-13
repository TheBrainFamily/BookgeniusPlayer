import { v } from "convex/values";
import { type ActionCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { adminAction } from "@convex/functions";

const extractChapterNumber = (basename: string): number => {
  const match = basename.match(/chapter[-_]?(\d+)/i);
  if (match) return parseInt(match[1], 10);
  const numMatch = basename.match(/^(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 0;
};

const ensureFolder = async (ctx: ActionCtx, path: string): Promise<void> => {
  try {
    await ctx.runMutation(components.assetManager.assetManager.createFolderByPath, { path });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Folder already exists")) {
      throw error;
    }
  }
};

const uploadGeneratedAsset = async (
  ctx: ActionCtx,
  args: {
    bookPath: string;
    folderPath: string;
    basename: string;
    content: string;
    contentType: string;
    chapterNumber?: number;
    title?: string;
    paragraphCount?: number;
    sourceFormat?: string;
  },
) => {
  const { folderPath, basename, content, contentType } = args;
  const { intentId, backend, uploadUrl } = await ctx.runMutation(
    internal.generateUploadUrl.startUploadInternal,
    { folderPath, basename, filename: basename, label: "Generated chapter artifact" },
  );

  const encoded = new TextEncoder().encode(content);
  const response = await fetch(uploadUrl, {
    method: backend === "r2" ? "PUT" : "POST",
    headers: { "Content-Type": contentType },
    body: encoded,
  });

  if (!response.ok) {
    throw new Error(`Upload failed (${folderPath}/${basename}): ${response.status}`);
  }

  const uploadResponse = backend === "convex" ? await response.json() : undefined;

  await ctx.runMutation(internal.generateUploadUrl.finishUploadInternal, {
    intentId,
    uploadResponse,
    size: encoded.byteLength,
    contentType,
  });

  const chapterNumber = args.chapterNumber ?? extractChapterNumber(basename);
  if (chapterNumber) {
    await ctx.runMutation(internal.metadata.upsertChapterMetadataInternal, {
      bookPath: args.bookPath,
      folderPath,
      basename,
      chapterNumber,
      title: args.title,
      paragraphCount: args.paragraphCount,
      sourceFormat: args.sourceFormat,
    });
  }
};

export const uploadHtmlSourceChapter = adminAction({
  args: {
    bookPath: v.string(),
    chapterNumber: v.number(),
    htmlContent: v.string(),
    title: v.optional(v.string()),
    paragraphCount: v.number(),
  },
  returns: v.object({ success: v.boolean(), versionId: v.string() }),
  handler: async (ctx, { bookPath, chapterNumber, htmlContent, title, paragraphCount }) => {
    const sourceFolder = `${bookPath}/chapters-source`;
    await ensureFolder(ctx, sourceFolder);

    await uploadGeneratedAsset(ctx, {
      bookPath,
      folderPath: sourceFolder,
      basename: `chapter-${chapterNumber}.html`,
      content: htmlContent,
      contentType: "text/html",
      chapterNumber,
      title,
      paragraphCount,
      sourceFormat: "html",
    });

    const versions = await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
      folderPath: sourceFolder,
      basename: `chapter-${chapterNumber}.html`,
    });

    const publishedVersion = versions.find((v) => v.state === "published");
    if (!publishedVersion) {
      throw new Error("Failed to publish HTML source chapter");
    }

    return { success: true, versionId: publishedVersion._id };
  },
});
