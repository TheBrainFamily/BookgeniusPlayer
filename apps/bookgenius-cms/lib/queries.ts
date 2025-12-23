import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";

// Reusable query options for admin panel
export const queries = {
  folders: (parentPath?: string) => convexQuery(api.cli.listFolders, { parentPath }),
  assets: (folderPath: string) => convexQuery(api.cli.listAssets, { folderPath }),
  publishedFilesInFolder: (folderPath: string) => convexQuery(api.cli.listPublishedFilesInFolder, { folderPath }),
  asset: (folderPath: string, basename: string) => convexQuery(api.cli.getAsset, { folderPath, basename }),
  assetVersions: (folderPath: string, basename: string) => convexQuery(api.cli.getAssetVersions, { folderPath, basename }),
  publishedFile: (folderPath: string, basename: string) => convexQuery(api.cli.getPublishedFile, { folderPath, basename }),
};
