import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import "dotenv/config";

const CONVEX_URL = process.env.CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error("Missing CONVEX_URL environment variable");
}

const client = new ConvexHttpClient(CONVEX_URL);

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";
export type AvatarState = "generating" | "ready" | "error" | "none";

export const convex = {
  async ensureBookStructure(args: { jobId: string; bookSlug: string; metadata?: { title?: string; author?: string; language?: string; form?: string }; totalChapters?: number }) {
    return await client.mutation(api.generator.ensureBookStructure, args);
  },

  async reportProgress(args: { bookPath: string; step: string; status: StepStatus; message?: string; error?: string }) {
    return await client.mutation(api.generator.reportProgress, args);
  },

  async heartbeat(bookPath: string) {
    return await client.mutation(api.generator.heartbeat, { bookPath });
  },

  async updateBookMetadata(args: { bookPath: string; metadata: { title?: string; author?: string; language?: string; form?: string } }) {
    return await client.mutation(api.generator.updateBookMetadata, args);
  },

  async updateGraphicalStyle(args: { bookPath: string; backgroundStyle?: string; periodStyle?: string; avatarStyle?: string }) {
    return await client.mutation(api.generator.updateGraphicalStyle, args);
  },

  async ensureCharacterFolder(args: { bookPath: string; characterSlug: string; displayName: string; summary?: string; aiPrompt?: string }) {
    return await client.mutation(api.generator.ensureCharacterFolder, args);
  },

  async markCharacterAvatarState(args: { characterPath: string; state: AvatarState }) {
    return await client.mutation(api.generator.markCharacterAvatarState, args);
  },

  async upsertBackgroundCue(args: { bookPath: string; chapter: number; paragraph: number; fileBasename: string; backgroundColor?: string; textColor?: string }) {
    return await client.mutation(api.generator.upsertBackgroundCue, args);
  },

  async upsertMusicCue(args: { bookPath: string; chapter: number; paragraph: number; fileBasename: string; order?: number }) {
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

  async getGenerationStatus(bookPath: string) {
    return await client.query(api.generator.getGenerationStatus, { bookPath });
  },

  async startUpload(args: { folderPath: string; basename: string; filename?: string; publish?: boolean; extra?: unknown }) {
    return await client.mutation(api.importHelpers.startUpload, args);
  },

  async finishUpload(args: { intentId: string; uploadResponse?: unknown; size?: number; contentType?: string; folderPath?: string; basename?: string }) {
    return await client.mutation(api.importHelpers.finishUpload, args);
  },

  async uploadFile(args: {
    folderPath: string;
    basename: string;
    content: Buffer | Uint8Array;
    contentType: string;
    publish?: boolean;
    extra?: unknown;
  }): Promise<{ assetId: string; versionId: string; version: number }> {
    const { intentId, uploadUrl, backend } = await this.startUpload({ folderPath: args.folderPath, basename: args.basename, publish: args.publish ?? true, extra: args.extra });

    const response = await fetch(uploadUrl, { method: backend === "r2" ? "PUT" : "POST", headers: { "Content-Type": args.contentType }, body: args.content });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    const uploadResponse = backend === "convex" ? await response.json() : undefined;

    return await this.finishUpload({ intentId, uploadResponse, size: args.content.length, contentType: args.contentType, folderPath: args.folderPath, basename: args.basename });
  },
};

export { client as convexClient };
