import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, components, internal } from "./_generated/api";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { renderChapterFromXmlDocument, type CharacterBundleInfo } from "../apps/player/src/services/live/xmlRendererCore";
import { extractCharacterMetadata } from "../apps/player/src/services/live/characterExtractor";

type ChapterExtra = { chapterNumber?: number; title?: string };

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
  const idAttr = fallbackChapterId ? ` id=\"${fallbackChapterId}\"` : "";
  return `<Chapter${idAttr}>${trimmed}</Chapter>`;
};

const ensureFolder = async (ctx: any, path: string): Promise<void> => {
  try {
    await ctx.runMutation(components.assetManager.assetManager.createFolderByPath, { path });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Folder already exists")) {
      throw error;
    }
  }
};

const uploadGeneratedAsset = async (ctx: any, args: { folderPath: string; basename: string; content: string; contentType: string; extra?: Record<string, unknown> }) => {
  const { folderPath, basename, content, contentType, extra } = args;
  const { intentId, backend, uploadUrl } = await ctx.runMutation(internal.generateUploadUrl.startUploadInternal, {
    folderPath,
    basename,
    filename: basename,
    publish: true,
    label: "Generated chapter artifact",
    extra,
  });

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
};

/**
 * Compile a single published chapter into HTML + per-chapter character fragments.
 * Intended to be triggered by scheduler after publishDraft.
 */
export const processPublishedChapter = internalAction({
  args: {
    bookPath: v.string(),
    chapterBasename: v.string(),
    versionId: v.string(),
  },
  handler: async (ctx, { bookPath, chapterBasename, versionId }) => {
    const chaptersPath = `${bookPath}/chapters`;
    if (!bookPath || !chaptersPath.endsWith(CHAPTERS_FOLDER_SUFFIX)) {
      throw new Error(`Invalid chapter path: ${chaptersPath}`);
    }

    const book = await ctx.runQuery(api.bookQueries.getBookMetadata, { bookPath });
    if (!book) {
      throw new Error(`Book not found: ${bookPath}`);
    }

    const versions = await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
      folderPath: chaptersPath,
      basename: chapterBasename,
    });

    const publishedVersion = versions.find((v) => v._id === versionId);
    const versionExtra = (publishedVersion?.extra ?? {}) as ChapterExtra;

    const xmlResult = await ctx.runAction(components.assetManager.assetFsHttp.getTextContent, { versionId });
    if (!xmlResult?.content) {
      throw new Error(`No XML content found for ${chapterBasename}`);
    }

    const normalizedXml = normalizeChapterXml(xmlResult.content, versionExtra.chapterNumber);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(normalizedXml, "text/xml") as unknown as Document;
    const parseError = xmlDoc.getElementsByTagName("parsererror")[0];
    if (parseError) {
      throw new Error(`XML parse error for ${chapterBasename}: ${parseError.textContent || "unknown error"}`);
    }

    const chapterElement = xmlDoc.getElementsByTagName("Chapter")[0];
    const chapterIdFromXml = chapterElement?.getAttribute("id") || "";
    const chapterNumberFromXml = Number.parseInt(chapterIdFromXml, 10);
    const chapterNumber = Number.isFinite(chapterNumberFromXml) && chapterNumberFromXml > 0 ? chapterNumberFromXml : versionExtra.chapterNumber ?? extractChapterNumber(chapterBasename);

    if (!chapterElement) {
      throw new Error(`Chapter element missing in ${chapterBasename}`);
    }
    if (!chapterNumber) {
      throw new Error(`Unable to determine chapter number for ${chapterBasename}`);
    }
    if (!chapterElement.getAttribute("id") && chapterNumber) {
      chapterElement.setAttribute("id", String(chapterNumber));
    }

    const bookForm = book.extra?.form?.toLowerCase() || "book";
    const bookLang = book.extra?.language?.toLowerCase() || "english";
    const bookSlug = book.slug;

    const characters = (await ctx.runQuery(api.bookQueries.listCharacters, { bookPath })) as Array<{
      slug: string;
      name: string;
      extra: CharacterBundleInfo["extra"];
    }>;
    const characterBundles = characters.map((c) => ({ slug: c.slug, name: c.name, extra: c.extra }));

    const serializer = new XMLSerializer();
    const { html, title } = renderChapterFromXmlDocument(xmlDoc, { bookSlug, bookLang, bookForm, characterBundles, serializer });
    const resolvedTitle = title || versionExtra.title;
    const paragraphCount = (html.match(/data-index="/g) ?? []).length;

    const knownCharacterSlugs = new Set<string>(characterBundles.map((c) => c.slug.toLowerCase()));
    const actualCharacterTags = new Set<string>();
    const elementNodes = chapterElement.getElementsByTagName("*");
    for (let i = 0; i < elementNodes.length; i++) {
      const tagName = elementNodes[i].tagName;
      if (knownCharacterSlugs.has(tagName.toLowerCase())) {
        actualCharacterTags.add(tagName);
      }
    }

    const characterMetadata = extractCharacterMetadata(xmlDoc, actualCharacterTags, bookForm, bookSlug, characterBundles);
    const strippedCharacterMetadata = characterMetadata.map(({ media, ...rest }) => rest);
    const characterPayload = JSON.stringify({ chapterNumber, characters: strippedCharacterMetadata });

    const htmlFolder = `${bookPath}/chapters-html`;
    const characterFolder = `${bookPath}/characters-data`;

    await ensureFolder(ctx, htmlFolder);
    await ensureFolder(ctx, characterFolder);

    await uploadGeneratedAsset(ctx, {
      folderPath: htmlFolder,
      basename: `chapter-${chapterNumber}.html`,
      content: html,
      contentType: "text/html",
      extra: { chapterNumber, title: resolvedTitle, sourceVersionId: versionId, paragraphCount },
    });

    await uploadGeneratedAsset(ctx, {
      folderPath: characterFolder,
      basename: `chapter-${chapterNumber}.json`,
      content: characterPayload,
      contentType: "application/json",
      extra: { chapterNumber, sourceVersionId: versionId },
    });
  },
});
