import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { api, components, internal } from "./_generated/api";
import { buildCharacterIndex, type CharacterBundle } from "./lib/characterDataV2";

type CharacterBundleResult = {
  slug: string;
  name: string;
  extra: unknown;
  avatar?: { url: string };
  speaks?: { url: string };
  listens?: { url: string };
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

const uploadAsset = async (
  ctx: ActionCtx,
  args: {
    folderPath: string;
    basename: string;
    content: string;
    contentType: string;
    extra?: Record<string, unknown>;
  },
) => {
  const { folderPath, basename, content, contentType, extra } = args;
  const { intentId, backend, uploadUrl } = await ctx.runMutation(
    internal.generateUploadUrl.startUploadInternal,
    { folderPath, basename, filename: basename, publish: true, label: "Character index", extra },
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
};

function toBundles(characters: CharacterBundleResult[]): CharacterBundle[] {
  return characters.map((c) => {
    const extra = (c.extra ?? {}) as { displayName?: string; summary?: string };
    return {
      slug: c.slug,
      name: extra.displayName ?? c.name,
      summary: extra.summary ?? "",
      media: { avatarUrl: c.avatar?.url, speaksUrl: c.speaks?.url, listensUrl: c.listens?.url },
    };
  });
}

function parseForm(extra: unknown): "prose" | "play" | "mixed" {
  const formRaw = ((extra as { form?: string })?.form ?? "prose").toLowerCase();
  return formRaw === "play" ? "play" : formRaw === "mixed" ? "mixed" : "prose";
}

async function generateIndexForBook(
  ctx: ActionCtx,
  bookPath: string,
): Promise<{ characterCount: number; form: string }> {
  const book = await ctx.runQuery(api.bookQueries.getBookMetadata, { bookPath });
  if (!book) {
    throw new Error(`Book not found: ${bookPath}`);
  }

  const form = parseForm(book.extra);
  const characters = (await ctx.runQuery(api.bookQueries.listCharacterBundlesWithDrafts, {
    bookPath,
  })) as CharacterBundleResult[];

  const bundles = toBundles(characters);
  const index = buildCharacterIndex(bundles, form);

  const indexFolder = `${bookPath}/characters-v2`;
  await ensureFolder(ctx, indexFolder);

  await uploadAsset(ctx, {
    folderPath: indexFolder,
    basename: "index.json",
    content: JSON.stringify(index),
    contentType: "application/json",
    extra: { generatedAt: Date.now() },
  });

  return { characterCount: bundles.length, form };
}

export const regenerateIndex = action({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    return await generateIndexForBook(ctx, bookPath);
  },
});

export const generateCharacterIndex = internalAction({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    return await generateIndexForBook(ctx, bookPath);
  },
});

export const regenerateAllCharacterIndexes = internalAction({
  args: {},
  handler: async (ctx) => {
    const books = await ctx.runQuery(api.bookQueries.listBooks, {});
    const results: {
      bookPath: string;
      success: boolean;
      error?: string;
      characterCount?: number;
    }[] = [];

    for (const book of books) {
      try {
        const result = await generateIndexForBook(ctx, book.path);
        results.push({ bookPath: book.path, success: true, characterCount: result.characterCount });
      } catch (e) {
        results.push({
          bookPath: book.path,
          success: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return results;
  },
});
