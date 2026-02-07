import { AdminConvexHttpClient } from "../lib/AdminConvexHttpClient";
import { api } from "@bookgenius/convex/_generated/api";
import "dotenv/config";

const CONVEX_URL = process.env.CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error("Missing CONVEX_URL environment variable");
}

const client = new AdminConvexHttpClient(CONVEX_URL);

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";
export type AvatarState = "generating" | "ready" | "error" | "none";

function toArrayBufferView(content: Uint8Array): Uint8Array<ArrayBuffer> {
  if (content.buffer instanceof ArrayBuffer) {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }

  return new Uint8Array(content);
}

export const convex = {
  async ensureBookStructure(args: {
    jobId: string;
    bookSlug: string;
    metadata?: { title?: string; author?: string; language?: string; form?: string };
    totalChapters?: number;
  }) {
    return await client.mutation(api.generator.ensureBookStructure, args);
  },

  async reportProgress(args: {
    bookPath: string;
    step: string;
    status: StepStatus;
    message?: string;
    error?: string;
  }) {
    return await client.mutation(api.generator.reportProgress, args);
  },

  async heartbeat(bookPath: string) {
    return await client.mutation(api.generator.heartbeat, { bookPath });
  },

  async updateBookMetadata(args: {
    bookPath: string;
    metadata: { title?: string; author?: string; language?: string; form?: string };
  }) {
    return await client.mutation(api.generator.updateBookMetadata, args);
  },

  async updateGraphicalStyle(args: {
    bookPath: string;
    backgroundStyle?: string;
    periodStyle?: string;
    avatarStyle?: string;
  }) {
    return await client.mutation(api.generator.updateGraphicalStyle, args);
  },

  async updateChapterMetadata(args: {
    bookPath: string;
    folderPath: string;
    basename: string;
    chapterNumber: number;
    title?: string;
    paragraphCount?: number;
    sourceFormat?: string;
  }) {
    return await client.mutation(api.metadata.updateChapterMetadata, args);
  },

  async ensureCharacterFolder(args: {
    bookPath: string;
    characterSlug: string;
    displayName: string;
    summary?: string;
    role?: string;
    aiPrompt?: string;
  }) {
    return await client.mutation(api.generator.ensureCharacterFolder, args);
  },

  async markCharacterAvatarState(args: { characterPath: string; state: AvatarState }) {
    return await client.mutation(api.generator.markCharacterAvatarState, args);
  },

  async upsertBackgroundCue(args: {
    bookPath: string;
    chapter: number;
    paragraph: number;
    fileBasename: string;
    backgroundColor?: string;
    textColor?: string;
  }) {
    return await client.mutation(api.generator.upsertBackgroundCue, args);
  },

  async upsertMusicCue(args: {
    bookPath: string;
    chapter: number;
    paragraph: number;
    fileBasename: string;
    order?: number;
  }) {
    return await client.mutation(api.generator.upsertMusicCue, args);
  },

  async incrementReadyChapters(bookPath: string) {
    return await client.mutation(api.generator.incrementReadyChapters, { bookPath });
  },

  async markCompleted(bookPath: string) {
    return await client.mutation(api.generator.markCompleted, { bookPath });
  },

  async markFailed(args: { bookPath: string; error: string }) {
    return await client.mutation(api.generator.markFailed, args);
  },

  async upsertCharacterChapterSummary(args: {
    bookPath: string;
    characterSlug: string;
    chapterNumber: number;
    summary: string;
    isFirstAppearance: boolean;
  }) {
    return await client.mutation(api.metadata.upsertCharacterChapterSummary, args);
  },

  async uploadNotes(args: {
    notes: {
      bookPath: string;
      noteId: string;
      content: string;
      chapter: number;
      paragraph?: number;
    }[];
  }) {
    if (args.notes.length === 0) return [];
    // Extract bookPath from first note (all notes should have the same bookPath)
    const bookPath = args.notes[0].bookPath;
    // Strip bookPath from individual notes since it's now a top-level arg
    const notes = args.notes.map(({ bookPath: _bp, ...rest }) => rest);
    return await client.mutation(api.notes.bulkCreate, { bookPath, notes });
  },

  async getGenerationStatus(bookPath: string) {
    return await client.query(api.generator.getGenerationStatus, { bookPath });
  },

  async startUpload(args: { folderPath: string; basename: string; filename?: string }) {
    return await client.mutation(api.importHelpers.startUpload, args);
  },

  async finishUpload(args: {
    intentId: string;
    uploadResponse?: unknown;
    size?: number;
    contentType?: string;
    folderPath?: string;
    basename?: string;
  }) {
    return await client.mutation(api.importHelpers.finishUpload, args);
  },

  async uploadFile(args: {
    folderPath: string;
    basename: string;
    content: Buffer | Uint8Array;
    contentType: string;
  }): Promise<{ assetId: string; versionId: string; version: number }> {
    const { intentId, uploadUrl, backend } = await this.startUpload({
      folderPath: args.folderPath,
      basename: args.basename,
    });

    const body = toArrayBufferView(args.content);
    const response = await fetch(uploadUrl, {
      method: backend === "r2" ? "PUT" : "POST",
      headers: { "Content-Type": args.contentType },
      body,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    const uploadResponse = backend === "convex" ? await response.json() : undefined;

    return await this.finishUpload({
      intentId,
      uploadResponse,
      size: args.content.length,
      contentType: args.contentType,
      folderPath: args.folderPath,
      basename: args.basename,
    });
  },
};

export interface CharacterReferenceCard {
  name: string;
  slug: string;
  summary: string;
}

export async function getChapterXml(
  bookPath: string,
  chapterNumber: number,
): Promise<string | null> {
  const versions = await client.query(api.cli.getAssetVersions, {
    folderPath: `${bookPath}/chapters`,
    basename: `chapter-${chapterNumber}.xml`,
  });

  if (!versions || versions.length === 0) {
    return null;
  }

  const publishedVersion = versions.find((v) => v.publishedAt != null);
  if (!publishedVersion) {
    return null;
  }

  const result = await client.action(api.cli.getTextContent, { versionId: publishedVersion._id });

  return result?.content ?? null;
}

export async function getCharacterReferenceCards(
  bookPath: string,
): Promise<CharacterReferenceCard[]> {
  const characters = await client.query(api.metadata.listCharacterMetadata, { bookPath });

  if (!characters || characters.length === 0) {
    return [];
  }

  return characters.map((c) => ({ name: c.displayName, slug: c.slug, summary: c.summary }));
}

export interface CharacterFolder {
  path: string;
  slug: string;
  displayName: string;
  summary: string;
  aiPrompt?: string;
  avatarGenerationState?: "generating" | "ready" | "error" | "none";
}

export async function getCharacterFolders(bookPath: string): Promise<CharacterFolder[]> {
  const characters = await client.query(api.metadata.listCharacterMetadata, { bookPath });

  if (!characters || characters.length === 0) {
    return [];
  }

  return characters.map((c) => ({
    path: c.characterPath,
    slug: c.slug,
    displayName: c.displayName,
    summary: c.summary,
    aiPrompt: c.aiPrompt,
    avatarGenerationState: c.avatarGenerationState ?? undefined,
  }));
}

export async function getPublishedFilesInFolder(
  folderPath: string,
): Promise<{ basename: string; versionId: string }[]> {
  return await client.query(api.cli.listPublishedFilesInFolder, { folderPath });
}

export async function updateCharacterFolder(args: {
  bookPath: string;
  characterSlug: string;
  displayName: string;
  summary?: string;
  aiPrompt?: string;
}) {
  return await client.mutation(api.generator.ensureCharacterFolder, args);
}

export { client as convexClient };
