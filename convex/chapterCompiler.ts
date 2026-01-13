import { v } from "convex/values";
import { type ActionCtx, internalAction } from "./_generated/server";
import { api, components, internal } from "./_generated/api";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { renderChapterFromXmlDocument } from "../apps/player/src/services/live/xmlRendererCore";
import { extractCharacterMetadata } from "../apps/player/src/services/live/characterExtractor";
import { extractOccurrences, type CompiledChapter } from "./lib/characterDataV2";
import { adminAction } from "@convex/functions";

const CHAPTERS_FOLDER_SUFFIX = "/chapters";

const extractChapterNumber = (basename: string): number => {
  const match = basename.match(/chapter[-_]?(\d+)/i);
  if (match) return parseInt(match[1], 10);
  const numMatch = basename.match(/^(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 0;
};

const normalizeChapterXml = (xml: string, fallbackChapterId?: number): string => {
  const trimmed = xml.trim();
  if (trimmed.startsWith("<Chapter")) {
    return trimmed;
  }
  const idAttr = fallbackChapterId ? ` id="${fallbackChapterId}"` : "";
  return `<Chapter${idAttr}>${trimmed}</Chapter>`;
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

/**
 * Compile a single published chapter into HTML + per-chapter character fragments.
 * Intended to be triggered by scheduler after a chapter is saved.
 */
export const processPublishedChapter = internalAction({
  args: { bookPath: v.string(), chapterBasename: v.string(), versionId: v.string() },
  // eslint-disable-next-line complexity -- chapter compilation with character extraction and HTML generation
  handler: async (ctx, { bookPath, chapterBasename, versionId }) => {
    const chaptersPath = `${bookPath}/chapters`;
    if (!bookPath || !chaptersPath.endsWith(CHAPTERS_FOLDER_SUFFIX)) {
      throw new Error(`Invalid chapter path: ${chaptersPath}`);
    }

    const book = await ctx.runQuery(api.metadata.getBookMetadata, { bookPath });
    if (!book) {
      throw new Error(`Book not found: ${bookPath}`);
    }

    const chapterMetadata = await ctx.runQuery(api.metadata.getChapterMetadata, {
      folderPath: chaptersPath,
      basename: chapterBasename,
    });

    const xmlResult = await ctx.runAction(components.assetManager.assetFsHttp.getTextContent, {
      versionId,
    });
    if (!xmlResult?.content) {
      throw new Error(`No XML content found for ${chapterBasename}`);
    }

    const normalizedXml = normalizeChapterXml(xmlResult.content, chapterMetadata?.chapterNumber);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(normalizedXml, "text/xml") as unknown as Document;
    const parseError = xmlDoc.getElementsByTagName("parsererror")[0];
    if (parseError) {
      throw new Error(
        `XML parse error for ${chapterBasename}: ${parseError.textContent || "unknown error"}`,
      );
    }

    const chapterElement = xmlDoc.getElementsByTagName("Chapter")[0];
    const chapterIdFromXml = chapterElement?.getAttribute("id") || "";
    const chapterNumberFromXml = Number.parseInt(chapterIdFromXml, 10);
    const chapterNumber =
      Number.isFinite(chapterNumberFromXml) && chapterNumberFromXml > 0
        ? chapterNumberFromXml
        : (chapterMetadata?.chapterNumber ?? extractChapterNumber(chapterBasename));

    if (!chapterElement) {
      throw new Error(`Chapter element missing in ${chapterBasename}`);
    }
    if (!chapterNumber) {
      throw new Error(`Unable to determine chapter number for ${chapterBasename}`);
    }
    if (!chapterElement.getAttribute("id") && chapterNumber) {
      chapterElement.setAttribute("id", String(chapterNumber));
    }

    const bookForm = book.form?.toLowerCase() || "book";
    const bookLang = book.language?.toLowerCase() || "english";
    const bookSlug = book.slug;

    const characters = (await ctx.runQuery(api.metadata.listCharacterMetadata, {
      bookPath,
    })) as Array<{ slug: string; displayName: string; summary: string }>;
    const characterBundles = characters.map((c) => ({
      slug: c.slug,
      name: c.displayName,
      metadata: { displayName: c.displayName, summary: c.summary },
    }));

    const serializer = new XMLSerializer();
    const { html, title } = renderChapterFromXmlDocument(xmlDoc, {
      bookSlug,
      bookLang,
      bookForm,
      characterBundles,
      serializer,
    });
    const resolvedTitle = title || chapterMetadata?.title;
    const paragraphCount = (html.match(/data-index="/g) ?? []).length;

    await ctx.runMutation(internal.metadata.upsertChapterMetadataInternal, {
      bookPath,
      folderPath: chaptersPath,
      basename: chapterBasename,
      chapterNumber,
      title: resolvedTitle,
    });

    const knownCharacterSlugs = new Set<string>(characterBundles.map((c) => c.slug.toLowerCase()));
    const actualCharacterTags = new Set<string>();
    const elementNodes = chapterElement.getElementsByTagName("*");
    for (let i = 0; i < elementNodes.length; i++) {
      const tagName = elementNodes[i].tagName;
      if (knownCharacterSlugs.has(tagName.toLowerCase())) {
        actualCharacterTags.add(tagName);
      }
    }

    const characterMetadata = extractCharacterMetadata(
      xmlDoc,
      actualCharacterTags,
      bookForm,
      bookSlug,
      characterBundles,
    );
    const strippedCharacterMetadata = characterMetadata.map(({ media: _media, ...rest }) => rest);
    const characterPayload = JSON.stringify({
      chapterNumber,
      characters: strippedCharacterMetadata,
    });

    const htmlFolder = `${bookPath}/chapters-html`;
    const characterFolder = `${bookPath}/characters-data`;
    const compiledFolder = `${bookPath}/chapters-compiled`;

    await ensureFolder(ctx, htmlFolder);
    await ensureFolder(ctx, characterFolder);
    await ensureFolder(ctx, compiledFolder);

    await uploadGeneratedAsset(ctx, {
      bookPath,
      folderPath: htmlFolder,
      basename: `chapter-${chapterNumber}.html`,
      content: html,
      contentType: "text/html",
      chapterNumber,
      title: resolvedTitle,
      paragraphCount,
      sourceFormat: "html",
    });

    await uploadGeneratedAsset(ctx, {
      bookPath,
      folderPath: characterFolder,
      basename: `chapter-${chapterNumber}.json`,
      content: characterPayload,
      contentType: "application/json",
      chapterNumber,
    });

    const occurrences = extractOccurrences(
      characterMetadata.map((c) => ({ slug: c.slug, infoPerChapter: c.infoPerChapter })),
      chapterNumber,
    );
    const compiledChapter: CompiledChapter = {
      html,
      occurrences,
      title: resolvedTitle,
      paragraphCount,
    };

    await uploadGeneratedAsset(ctx, {
      bookPath,
      folderPath: compiledFolder,
      basename: `chapter-${chapterNumber}.json`,
      content: JSON.stringify(compiledChapter),
      contentType: "application/json",
      chapterNumber,
      title: resolvedTitle,
      paragraphCount,
    });

    const backendUrl = process.env.BACKEND_SERVER_URL;
    if (backendUrl) {
      try {
        console.log(
          `[chapterCompiler] Triggering embedding regeneration for ${bookSlug} chapter ${chapterNumber}`,
        );
        const response = await fetch(`${backendUrl}/trpc/regenerateChapterEmbeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookSlug,
            chapterNumber,
            chapterXml: normalizedXml,
            bookLanguage: bookLang,
          }),
        });
        if (!response.ok) {
          console.error(`[chapterCompiler] Embedding regeneration failed: ${response.status}`);
        } else {
          const result = await response.json();
          console.log(`[chapterCompiler] Embedding regeneration complete:`, result);
        }
      } catch (e) {
        console.error(`[chapterCompiler] Failed to trigger embedding regeneration:`, e);
      }
    }
  },
});

type ChapterListItem = { basename: string; versionId: string; chapterNumber: number };

type RecompileResult = {
  success: boolean;
  error?: string;
  compiled: number;
  total?: number;
  failures?: { chapterNumber: number; success: boolean; error?: string }[];
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

export const recompileAllChapters = adminAction({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }): Promise<RecompileResult> => {
    const chapters = (await ctx.runQuery(api.bookQueries.listChapters, {
      bookPath,
    })) as ChapterListItem[];
    if (chapters.length === 0) {
      return { success: false, error: "No chapters found", compiled: 0 };
    }

    const results: { chapterNumber: number; success: boolean; error?: string }[] = [];

    for (const chapter of chapters) {
      try {
        await ctx.runAction(internal.chapterCompiler.processPublishedChapter, {
          bookPath,
          chapterBasename: chapter.basename,
          versionId: chapter.versionId,
        });
        results.push({ chapterNumber: chapter.chapterNumber, success: true });
      } catch (e) {
        results.push({
          chapterNumber: chapter.chapterNumber,
          success: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const compiled = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);

    return {
      success: failed.length === 0,
      compiled,
      total: chapters.length,
      failures: failed.length > 0 ? failed : undefined,
    };
  },
});
