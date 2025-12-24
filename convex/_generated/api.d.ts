/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as backgroundCues from "../backgroundCues.js";
import type * as backgroundMetadata from "../backgroundMetadata.js";
import type * as backgroundPreviewHttp from "../backgroundPreviewHttp.js";
import type * as bookQueries from "../bookQueries.js";
import type * as chapterCompiler from "../chapterCompiler.js";
import type * as cli from "../cli.js";
import type * as comicGeneration from "../comicGeneration.js";
import type * as comicSubmissions from "../comicSubmissions.js";
import type * as comics from "../comics.js";
import type * as generateUploadUrl from "../generateUploadUrl.js";
import type * as http from "../http.js";
import type * as imageProcessing from "../imageProcessing.js";
import type * as importHelpers from "../importHelpers.js";
import type * as kanban from "../kanban.js";
import type * as musicCues from "../musicCues.js";
import type * as musicMetadata from "../musicMetadata.js";
import type * as notes from "../notes.js";
import type * as prompts_storyContext from "../prompts/storyContext.js";
import type * as reset from "../reset.js";
import type * as variants from "../variants.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  backgroundCues: typeof backgroundCues;
  backgroundMetadata: typeof backgroundMetadata;
  backgroundPreviewHttp: typeof backgroundPreviewHttp;
  bookQueries: typeof bookQueries;
  chapterCompiler: typeof chapterCompiler;
  cli: typeof cli;
  comicGeneration: typeof comicGeneration;
  comicSubmissions: typeof comicSubmissions;
  comics: typeof comics;
  generateUploadUrl: typeof generateUploadUrl;
  http: typeof http;
  imageProcessing: typeof imageProcessing;
  importHelpers: typeof importHelpers;
  kanban: typeof kanban;
  musicCues: typeof musicCues;
  musicMetadata: typeof musicMetadata;
  notes: typeof notes;
  "prompts/storyContext": typeof prompts_storyContext;
  reset: typeof reset;
  variants: typeof variants;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  assetManager: {
    assetFsHttp: {
      getBlobForServing: FunctionReference<
        "action",
        "internal",
        { storageId: string },
        null | ArrayBuffer
      >;
      getPublishedFileForServing: FunctionReference<
        "query",
        "internal",
        { basename: string; folderPath: string },
        | null
        | {
            cacheControl?: string;
            contentType?: string;
            kind: "blob";
            storageId: string;
          }
        | { cacheControl?: string; kind: "redirect"; location: string }
      >;
      getTextContent: FunctionReference<
        "action",
        "internal",
        { versionId: string },
        null | { content: string; contentType?: string }
      >;
      getVersionForServing: FunctionReference<
        "query",
        "internal",
        { versionId: string },
        | null
        | {
            cacheControl?: string;
            contentType?: string;
            kind: "blob";
            storageId: string;
          }
        | { cacheControl?: string; kind: "redirect"; location: string }
      >;
      getVersionPreviewUrl: FunctionReference<
        "query",
        "internal",
        { versionId: string },
        null | { contentType?: string; size?: number; url: string }
      >;
    };
    assetManager: {
      commitVersion: FunctionReference<
        "mutation",
        "internal",
        {
          basename: string;
          extra?: any;
          folderPath: string;
          label?: string;
          publish?: boolean;
        },
        { assetId: string; version: number; versionId: string }
      >;
      configureStorageBackend: FunctionReference<
        "mutation",
        "internal",
        {
          backend: "convex" | "r2";
          r2KeyPrefix?: string;
          r2PublicUrl?: string;
        },
        null
      >;
      createAsset: FunctionReference<
        "mutation",
        "internal",
        { basename: string; extra?: any; folderPath: string },
        string
      >;
      createFolderByName: FunctionReference<
        "mutation",
        "internal",
        { extra?: any; name: string; parentPath: string },
        string
      >;
      createFolderByPath: FunctionReference<
        "mutation",
        "internal",
        { extra?: any; name?: string; path: string },
        string
      >;
      createVersionFromStorageId: FunctionReference<
        "mutation",
        "internal",
        {
          basename: string;
          extra?: any;
          folderPath: string;
          label?: string;
          publish?: boolean;
          storageId: string;
        },
        { assetId: string; version: number; versionId: string }
      >;
      deleteDataBatch: FunctionReference<
        "mutation",
        "internal",
        { batchSize?: number },
        {
          deletedAssets: number;
          deletedEvents: number;
          deletedFolders: number;
          deletedIntents: number;
          deletedVersions: number;
          hasMore: boolean;
        }
      >;
      finishUpload: FunctionReference<
        "mutation",
        "internal",
        {
          contentType?: string;
          intentId: string;
          r2Config?: {
            R2_ACCESS_KEY_ID: string;
            R2_BUCKET: string;
            R2_ENDPOINT: string;
            R2_SECRET_ACCESS_KEY: string;
          };
          size?: number;
          uploadResponse?: any;
        },
        { assetId: string; version: number; versionId: string }
      >;
      getAsset: FunctionReference<
        "query",
        "internal",
        { basename: string; folderPath: string },
        null | {
          _creationTime: number;
          _id: string;
          basename: string;
          createdAt: number;
          createdBy?: string;
          draftVersionId?: string;
          extra?: any;
          folderPath: string;
          publishedVersionId?: string;
          updatedAt: number;
          updatedBy?: string;
          versionCounter: number;
        }
      >;
      getAssetVersions: FunctionReference<
        "query",
        "internal",
        { basename: string; folderPath: string },
        Array<{
          _creationTime: number;
          _id: string;
          archivedAt?: number;
          archivedBy?: string;
          assetId: string;
          contentType?: string;
          createdAt: number;
          createdBy?: string;
          extra?: any;
          label?: string;
          originalFilename?: string;
          publishedAt?: number;
          publishedBy?: string;
          r2Key?: string;
          sha256?: string;
          size?: number;
          state: "draft" | "published" | "archived";
          storageId?: string;
          updatedBy?: string;
          uploadStatus?: "pending" | "ready";
          version: number;
        }>
      >;
      getFolder: FunctionReference<
        "query",
        "internal",
        { path: string },
        null | {
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          extra?: any;
          name: string;
          path: string;
          updatedAt: number;
          updatedBy?: string;
        }
      >;
      getFolderWithAssets: FunctionReference<
        "query",
        "internal",
        { path: string },
        null | {
          assets: Array<{
            _creationTime: number;
            _id: string;
            basename: string;
            createdAt: number;
            createdBy?: string;
            draftVersionId?: string;
            extra?: any;
            folderPath: string;
            publishedVersionId?: string;
            updatedAt: number;
            updatedBy?: string;
            versionCounter: number;
          }>;
          folder: {
            _creationTime: number;
            _id: string;
            createdAt: number;
            createdBy?: string;
            extra?: any;
            name: string;
            path: string;
            updatedAt: number;
            updatedBy?: string;
          };
        }
      >;
      getPublishedFile: FunctionReference<
        "query",
        "internal",
        { basename: string; folderPath: string },
        null | {
          basename: string;
          contentType?: string;
          createdAt: number;
          createdBy?: string;
          folderPath: string;
          publishedAt: number;
          publishedBy?: string;
          r2Key?: string;
          sha256?: string;
          size?: number;
          state: "published";
          storageId?: string;
          url: string;
          version: number;
        }
      >;
      getPublishedVersion: FunctionReference<
        "query",
        "internal",
        { basename: string; folderPath: string },
        any
      >;
      getStorageBackendConfig: FunctionReference<
        "query",
        "internal",
        {},
        "convex" | "r2"
      >;
      listAssetEvents: FunctionReference<
        "query",
        "internal",
        { basename: string; folderPath: string },
        Array<{
          createdAt: number;
          createdBy?: string;
          fromBasename?: string;
          fromFolderPath?: string;
          toBasename?: string;
          toFolderPath?: string;
          type: string;
        }>
      >;
      listAssets: FunctionReference<
        "query",
        "internal",
        { folderPath: string },
        Array<{
          _creationTime: number;
          _id: string;
          basename: string;
          createdAt: number;
          createdBy?: string;
          draftVersionId?: string;
          extra?: any;
          folderPath: string;
          publishedVersionId?: string;
          updatedAt: number;
          updatedBy?: string;
          versionCounter: number;
        }>
      >;
      listFolders: FunctionReference<
        "query",
        "internal",
        { parentPath?: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          createdBy?: string;
          extra?: any;
          name: string;
          path: string;
          updatedAt: number;
          updatedBy?: string;
        }>
      >;
      listPublishedAssetsInFolder: FunctionReference<
        "query",
        "internal",
        { folderPath: string },
        Array<{
          basename: string;
          createdAt: number;
          createdBy?: string;
          extra?: any;
          folderPath: string;
          label?: string;
          publishedAt?: number;
          publishedBy?: string;
          version: number;
        }>
      >;
      listPublishedFilesInFolder: FunctionReference<
        "query",
        "internal",
        { folderPath: string },
        Array<{
          basename: string;
          contentType?: string;
          folderPath: string;
          publishedAt?: number;
          r2Key?: string;
          size?: number;
          storageId?: string;
          url: string;
          version: number;
          versionId: string;
        }>
      >;
      moveAsset: FunctionReference<
        "mutation",
        "internal",
        { basename: string; fromFolderPath: string; toFolderPath: string },
        { assetId: string; fromFolderPath: string; toFolderPath: string }
      >;
      publishDraft: FunctionReference<
        "mutation",
        "internal",
        { basename: string; folderPath: string },
        any
      >;
      renameAsset: FunctionReference<
        "mutation",
        "internal",
        { basename: string; folderPath: string; newBasename: string },
        { assetId: string; newBasename: string; oldBasename: string }
      >;
      restoreVersion: FunctionReference<
        "mutation",
        "internal",
        { label?: string; versionId: string },
        {
          assetId: string;
          restoredFromVersion: number;
          version: number;
          versionId: string;
        }
      >;
      startUpload: FunctionReference<
        "mutation",
        "internal",
        {
          basename: string;
          extra?: any;
          filename?: string;
          folderPath: string;
          label?: string;
          publish?: boolean;
          r2Config?: {
            R2_ACCESS_KEY_ID: string;
            R2_BUCKET: string;
            R2_ENDPOINT: string;
            R2_SECRET_ACCESS_KEY: string;
          };
        },
        {
          backend: "convex" | "r2";
          intentId: string;
          r2Key?: string;
          uploadUrl: string;
        }
      >;
      updateFolder: FunctionReference<
        "mutation",
        "internal",
        { extra?: any; name?: string; newPath?: string; path: string },
        any
      >;
      updateVersionExtra: FunctionReference<
        "mutation",
        "internal",
        { extra: any; versionId: string },
        { extra: any; versionId: string }
      >;
    };
    signedUrl: {
      getSignedUrl: FunctionReference<
        "action",
        "internal",
        {
          expiresIn?: number;
          r2Config?: {
            R2_ACCESS_KEY_ID: string;
            R2_BUCKET: string;
            R2_ENDPOINT: string;
            R2_SECRET_ACCESS_KEY: string;
          };
          versionId: string;
        },
        null | string
      >;
    };
  };
};
