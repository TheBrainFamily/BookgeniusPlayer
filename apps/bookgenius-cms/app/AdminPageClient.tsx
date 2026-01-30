"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { AdminPanel } from "@/admin/AdminPanel";

export function AdminPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get search params
  const folder = searchParams.get("folder") ?? "";
  const asset = searchParams.get("asset");
  const version = searchParams.get("version");

  // Navigation handlers
  const handleFolderSelect = useCallback(
    (folderPath: string) => {
      const params = new URLSearchParams();
      if (folderPath) params.set("folder", folderPath);
      router.push(`/${params.toString() ? `?${params}` : ""}`);
    },
    [router],
  );

  const handleAssetSelect = useCallback(
    (assetInfo: { folderPath: string; basename: string } | null) => {
      const params = new URLSearchParams();
      if (assetInfo) {
        if (assetInfo.folderPath) params.set("folder", assetInfo.folderPath);
        params.set("asset", assetInfo.basename);
      } else {
        if (folder) params.set("folder", folder);
      }
      router.push(`/${params.toString() ? `?${params}` : ""}`);
    },
    [router, folder],
  );

  const handleVersionSelect = useCallback(
    (versionId: string | null) => {
      const params = new URLSearchParams();
      if (folder) params.set("folder", folder);
      if (asset) params.set("asset", asset);
      if (versionId) params.set("version", versionId);
      router.push(`/${params.toString() ? `?${params}` : ""}`);
    },
    [router, folder, asset],
  );

  return (
    <AdminPanel
      folderPath={folder}
      selectedAsset={asset ? { folderPath: folder, basename: asset } : null}
      selectedVersionId={version ?? null}
      onFolderSelect={handleFolderSelect}
      onAssetSelect={handleAssetSelect}
      onVersionSelect={handleVersionSelect}
    />
  );
}
