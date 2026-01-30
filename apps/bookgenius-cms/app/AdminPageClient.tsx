"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/clerk-react";
import { AdminPanel } from "@/admin/AdminPanel";

export function AdminPageClient() {
  const { isLoaded, isSignedIn } = useAuth();

  const basePath = "/admin";

  const parseSearch = useCallback((search: string) => {
    const params = new URLSearchParams(search);
    return {
      folder: params.get("folder") ?? "",
      asset: params.get("asset"),
      version: params.get("version"),
    };
  }, []);

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("popstate", onStoreChange);
    return () => window.removeEventListener("popstate", onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return "";
    return window.location.search;
  }, []);

  const search = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const query = useMemo(() => parseSearch(search), [parseSearch, search]);

  const pushQuery = useCallback(
    (next: { folder: string; asset: string | null; version: string | null }) => {
      const params = new URLSearchParams();
      if (next.folder) params.set("folder", next.folder);
      if (next.asset) params.set("asset", next.asset);
      if (next.version) params.set("version", next.version);
      const qs = params.toString();
      const nextUrl = qs ? `${basePath}?${qs}` : basePath;
      window.history.pushState(null, "", nextUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [basePath],
  );

  // Navigation handlers
  const handleFolderSelect = useCallback(
    (folderPath: string) => {
      pushQuery({ folder: folderPath, asset: null, version: null });
    },
    [pushQuery],
  );

  const handleAssetSelect = useCallback(
    (assetInfo: { folderPath: string; basename: string } | null) => {
      if (assetInfo) {
        pushQuery({ folder: assetInfo.folderPath, asset: assetInfo.basename, version: null });
      } else {
        pushQuery({ folder: query.folder, asset: null, version: null });
      }
    },
    [pushQuery, query.folder],
  );

  const handleVersionSelect = useCallback(
    (versionId: string | null) => {
      pushQuery({ folder: query.folder, asset: query.asset ?? null, version: versionId });
    },
    [pushQuery, query.folder, query.asset],
  );

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      window.location.replace(`${basePath}/sign-in`);
    }
  }, [basePath, isLoaded, isSignedIn]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <AdminPanel
      folderPath={query.folder}
      selectedAsset={query.asset ? { folderPath: query.folder, basename: query.asset } : null}
      selectedVersionId={query.version ?? null}
      onFolderSelect={handleFolderSelect}
      onAssetSelect={handleAssetSelect}
      onVersionSelect={handleVersionSelect}
    />
  );
}
