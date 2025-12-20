/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    assetFsHttp: {
      getBlobForServing: FunctionReference<
        "action",
        "internal",
        { storageId: string },
        null | ArrayBuffer,
        Name
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
        | { cacheControl?: string; kind: "redirect"; location: string },
        Name
      >;
      getTextContent: FunctionReference<
        "action",
        "internal",
        { versionId: string },
        null | { content: string; contentType?: string },
        Name
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
        | { cacheControl?: string; kind: "redirect"; location: string },
        Name
      >;
      getVersionPreviewUrl: FunctionReference<
        "query",
        "internal",
        { versionId: string },
        null | { contentType?: string; size?: number; url: string },
        Name
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
        { assetId: string; version: number; versionId: string },
        Name
      >;
      configureStorageBackend: FunctionReference<
        "mutation",
        "internal",
        {
          backend: "convex" | "r2";
          r2KeyPrefix?: string;
          r2PublicUrl?: string;
        },
        null,
        Name
      >;
      createAsset: FunctionReference<
        "mutation",
        "internal",
        { basename: string; extra?: any; folderPath: string },
        string,
        Name
      >;
      createFolderByName: FunctionReference<
        "mutation",
        "internal",
        { extra?: any; name: string; parentPath: string },
        string,
        Name
      >;
      createFolderByPath: FunctionReference<
        "mutation",
        "internal",
        { extra?: any; name?: string; path: string },
        string,
        Name
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
        { assetId: string; version: number; versionId: string },
        Name
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
        { assetId: string; version: number; versionId: string },
        Name
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
        },
        Name
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
        }>,
        Name
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
        },
        Name
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
        },
        Name
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
        },
        Name
      >;
      getPublishedVersion: FunctionReference<
        "query",
        "internal",
        { basename: string; folderPath: string },
        any,
        Name
      >;
      getStorageBackendConfig: FunctionReference<
        "query",
        "internal",
        {},
        "convex" | "r2",
        Name
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
        }>,
        Name
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
        }>,
        Name
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
        }>,
        Name
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
        }>,
        Name
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
        }>,
        Name
      >;
      moveAsset: FunctionReference<
        "mutation",
        "internal",
        { basename: string; fromFolderPath: string; toFolderPath: string },
        { assetId: string; fromFolderPath: string; toFolderPath: string },
        Name
      >;
      publishDraft: FunctionReference<
        "mutation",
        "internal",
        { basename: string; folderPath: string },
        any,
        Name
      >;
      renameAsset: FunctionReference<
        "mutation",
        "internal",
        { basename: string; folderPath: string; newBasename: string },
        { assetId: string; newBasename: string; oldBasename: string },
        Name
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
        },
        Name
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
        },
        Name
      >;
      updateFolder: FunctionReference<
        "mutation",
        "internal",
        { extra?: any; name?: string; newPath?: string; path: string },
        any,
        Name
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
        null | string,
        Name
      >;
    };
  };
