import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { queries } from "@/lib/queries";
import {
  Grid3X3,
  List,
  Search,
  X,
  Plus,
  Upload,
  Code,
  FolderOpen,
  Folder,
  ChevronRight,
  Loader2,
  Check,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AssetCard, type AssetData } from "./AssetCard";
import { AssetListRow } from "./AssetListRow";
import { getContentTypeCategory } from "@/lib/utils";
import { toast } from "sonner";

interface AssetListProps {
  folderPath: string;
  onAssetSelect: (asset: { folderPath: string; basename: string }) => void;
  onFolderSelect: (path: string) => void;
  onUploadNew: () => void;
  onCreateAsset: () => void;
  onCreateFolder: () => void;
  onShowSnippet: () => void;
}

interface FolderData {
  _id: string;
  path: string;
  name: string;
  _creationTime: number;
}

// Folder card for grid view
function FolderGridItem({
  folder,
  onClick,
  onMouseEnter,
}: {
  folder: FolderData;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="group bg-card rounded-xl border border-border overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all duration-200 text-left w-full"
    >
      <div className="aspect-video bg-muted flex items-center justify-center">
        <Folder className="h-16 w-16 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate flex-1">{folder.name}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <Badge variant="secondary" className="mt-2 text-xs">
          Folder
        </Badge>
      </div>
    </button>
  );
}

// Folder row for list view
function FolderListItem({
  folder,
  onClick,
  onMouseEnter,
}: {
  folder: FolderData;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="group w-full flex items-center gap-4 px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors text-left"
    >
      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Folder className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{folder.name}</p>
        <p className="text-xs text-muted-foreground">Folder</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

type ContentTypeFilter = "all" | "image" | "audio" | "video" | "text" | "json" | "other";

const typeFilters: { value: ContentTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
  { value: "text", label: "Text" },
  { value: "json", label: "JSON" },
  { value: "other", label: "Other" },
];

interface UploadItem {
  id: string;
  file: File;
  targetFolder: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

// Helper to recursively read directory entries from drag-and-drop
async function getFilesFromEntry(
  entry: FileSystemEntry,
  basePath: string,
): Promise<{ file: File; relativePath: string }[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
    return [{ file, relativePath: basePath }];
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();

    // readEntries may not return all entries at once, so we need to call it repeatedly
    const readAllEntries = async (): Promise<FileSystemEntry[]> => {
      const entries: FileSystemEntry[] = [];
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve));
        entries.push(...batch);
      } while (batch.length > 0);
      return entries;
    };

    const entries = await readAllEntries();
    const results: { file: File; relativePath: string }[] = [];

    for (const childEntry of entries) {
      const childPath = basePath ? `${basePath}/${childEntry.name}` : childEntry.name;
      const childFiles = await getFilesFromEntry(childEntry, childPath);
      results.push(...childFiles);
    }
    return results;
  }

  return [];
}

// eslint-disable-next-line complexity -- TODO: refactor to reduce complexity
export function AssetList({
  folderPath,
  onAssetSelect,
  onFolderSelect,
  onUploadNew,
  onCreateAsset,
  onCreateFolder,
  onShowSnippet,
}: AssetListProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ContentTypeFilter>("all");
  const [dragOver, setDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [assetToRename, setAssetToRename] = useState<{
    folderPath: string;
    basename: string;
  } | null>(null);
  const [newBasename, setNewBasename] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const queryClient = useQueryClient();

  // Mutations
  const startUpload = useMutation(api.generateUploadUrl.startUpload);
  const finishUpload = useMutation(api.generateUploadUrl.finishUpload);
  const createFolderByPath = useMutation(api.cli.createFolderByPath);
  const renameAssetMutation = useMutation(api.cli.renameAsset);

  // Upload a single file
  const uploadSingleFile = useCallback(
    async (item: UploadItem) => {
      setUploadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i)));

      try {
        // 1. Start upload
        const { intentId, uploadUrl, backend } = await startUpload({
          folderPath: item.targetFolder,
          basename: item.file.name,
          publish: true,
        });

        // 2. Upload file - R2 uses PUT, Convex uses POST
        const res = await fetch(uploadUrl, {
          method: backend === "r2" ? "PUT" : "POST",
          headers: { "Content-Type": item.file.type },
          body: item.file,
        });

        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

        // 3. Parse response - Convex returns JSON, R2 returns empty
        const uploadResponse = backend === "convex" ? await res.json() : undefined;

        // 4. Finish upload with file metadata (include folderPath/basename for post-upload hooks)
        await finishUpload({
          intentId,
          uploadResponse,
          size: item.file.size,
          contentType: item.file.type,
          folderPath: item.targetFolder,
          basename: item.file.name,
        });

        setUploadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)));
      } catch (error) {
        setUploadQueue((q) =>
          q.map((i) => (i.id === item.id ? { ...i, status: "error", error: String(error) } : i)),
        );
      }
    },
    [startUpload, finishUpload],
  );

  // Process the upload queue with concurrency limit
  const processUploadQueue = useCallback(
    async (queue: UploadItem[]) => {
      // Collect unique folder paths that need to be created
      const uniqueFolders = [
        ...new Set(queue.map((q) => q.targetFolder).filter((f) => f && f !== folderPath)),
      ];
      // Sort by depth so parents are created first
      uniqueFolders.sort((a, b) => a.split("/").length - b.split("/").length);

      // Create folders first (sequentially to ensure parents exist)
      for (const folder of uniqueFolders) {
        try {
          await createFolderByPath({ path: folder });
        } catch {
          // Folder may already exist, which is fine
        }
      }

      // Upload files with concurrency limit
      const CONCURRENT_LIMIT = 4;
      const chunks: UploadItem[][] = [];
      for (let i = 0; i < queue.length; i += CONCURRENT_LIMIT) {
        chunks.push(queue.slice(i, i + CONCURRENT_LIMIT));
      }

      for (const chunk of chunks) {
        await Promise.all(chunk.map((item) => uploadSingleFile(item)));
      }

      // Show completion toast
      toast.success(`Uploaded ${queue.length} file${queue.length > 1 ? "s" : ""}`);

      // Clear queue after delay to show completion state
      setTimeout(() => setUploadQueue([]), 2000);
    },
    [folderPath, createFolderByPath, uploadSingleFile],
  );

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const items = Array.from(e.dataTransfer.items);
      const filesToUpload: UploadItem[] = [];

      for (const item of items) {
        if (item.kind !== "file") continue;

        const entry = item.webkitGetAsEntry?.();

        if (entry?.isDirectory) {
          // Folder drop - traverse recursively
          try {
            const files = await getFilesFromEntry(entry, entry.name);
            for (const { file, relativePath } of files) {
              const pathParts = relativePath.split("/");
              pathParts.pop(); // Remove filename
              const subfolderPath =
                pathParts.length > 0
                  ? folderPath
                    ? `${folderPath}/${pathParts.join("/")}`
                    : pathParts.join("/")
                  : folderPath;

              filesToUpload.push({
                id: crypto.randomUUID(),
                file,
                targetFolder: subfolderPath,
                status: "pending",
              });
            }
          } catch {
            toast.error(`Failed to read folder: ${entry.name}`);
          }
        } else {
          // Regular file
          const file = item.getAsFile();
          if (file) {
            filesToUpload.push({
              id: crypto.randomUUID(),
              file,
              targetFolder: folderPath,
              status: "pending",
            });
          }
        }
      }

      // Enforce 50 file limit
      if (filesToUpload.length > 50) {
        toast.error(`Too many files (${filesToUpload.length}). Maximum is 50 files at once.`);
        return;
      }

      if (filesToUpload.length > 0) {
        setUploadQueue(filesToUpload);
        processUploadQueue(filesToUpload);
      }
    },
    [folderPath, processUploadQueue],
  );

  // Rename handlers
  const handleRenameClick = useCallback((asset: { folderPath: string; basename: string }) => {
    setAssetToRename(asset);
    setNewBasename(asset.basename);
    setRenameDialogOpen(true);
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (!assetToRename || !newBasename.trim()) return;
    if (newBasename === assetToRename.basename) {
      setRenameDialogOpen(false);
      return;
    }

    setIsRenaming(true);
    try {
      await renameAssetMutation({
        folderPath: assetToRename.folderPath,
        basename: assetToRename.basename,
        newBasename: newBasename.trim(),
      });
      toast.success(`Renamed to "${newBasename.trim()}"`);
      // Invalidate queries to refresh the asset list
      queryClient.invalidateQueries({ queryKey: ["assets", folderPath] });
      queryClient.invalidateQueries({ queryKey: ["publishedFilesInFolder", folderPath] });
      setRenameDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename asset");
    } finally {
      setIsRenaming(false);
    }
  }, [assetToRename, newBasename, renameAssetMutation, queryClient, folderPath]);

  // Prefetch folder data on hover
  const handleFolderPrefetch = useCallback(
    (path: string) => {
      queryClient.prefetchQuery(queries.folders(path));
      queryClient.prefetchQuery(queries.assets(path));
      queryClient.prefetchQuery(queries.publishedFilesInFolder(path));
    },
    [queryClient],
  );

  // Non-suspense queries so SSR renders instantly with loading state
  const { data: subfolders, isLoading: subfoldersLoading } = useQuery(queries.folders(folderPath));
  const { data: assets, isLoading: assetsLoading } = useQuery(queries.assets(folderPath));
  const { data: publishedFiles, isLoading: publishedLoading } = useQuery(
    queries.publishedFilesInFolder(folderPath),
  );

  // All hooks must be called before any conditional returns
  // Create a lookup map for published info
  const publishedInfoMap = useMemo(() => {
    const map = new Map<string, { contentType?: string; size?: number; url?: string }>();
    if (!publishedFiles) return map;
    for (const file of publishedFiles) {
      map.set(file.basename, { contentType: file.contentType, size: file.size, url: file.url });
    }
    return map;
  }, [publishedFiles]);

  // Filter subfolders by search query
  const filteredFolders = useMemo(() => {
    if (!subfolders) return [];
    if (!searchQuery) return subfolders;
    return subfolders.filter((folder) =>
      folder.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [subfolders, searchQuery]);

  // Filter assets
  const filteredAssets = useMemo(() => {
    if (!assets) return [];
    return assets.filter((asset) => {
      // Search filter
      if (searchQuery && !asset.basename.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Type filter
      if (typeFilter !== "all") {
        const info = publishedInfoMap.get(asset.basename);
        const category = getContentTypeCategory(info?.contentType);
        if (category !== typeFilter) {
          return false;
        }
      }

      return true;
    });
  }, [assets, searchQuery, typeFilter, publishedInfoMap]);

  const isLoading = subfoldersLoading || assetsLoading || publishedLoading;

  if (isLoading || !subfolders || !assets) {
    return <AssetListSkeleton />;
  }

  const isEmpty = filteredAssets.length === 0 && filteredFolders.length === 0;
  const hasNoContent = assets.length === 0 && subfolders.length === 0;

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay - shown when dragging */}
      {dragOver && uploadQueue.length === 0 && (
        <div className="absolute inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="absolute inset-3 rounded-xl border-2 border-dashed border-primary animate-pulse" />
          <div className="absolute top-3 left-3 w-8 h-8 border-l-4 border-t-4 border-primary rounded-tl-xl" />
          <div className="absolute top-3 right-3 w-8 h-8 border-r-4 border-t-4 border-primary rounded-tr-xl" />
          <div className="absolute bottom-3 left-3 w-8 h-8 border-l-4 border-b-4 border-primary rounded-bl-xl" />
          <div className="absolute bottom-3 right-3 w-8 h-8 border-r-4 border-b-4 border-primary rounded-br-xl" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                Drop files or folders to upload
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                to <span className="font-mono text-primary">{folderPath || "(root)"}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upload progress overlay */}
      {uploadQueue.length > 0 && (
        <div className="absolute inset-0 z-50">
          <div className="absolute inset-0 bg-background/90 backdrop-blur-sm" />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-md bg-card rounded-xl border border-border shadow-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                {uploadQueue.every((f) => f.status === "done") ? (
                  <Check className="h-5 w-5 text-success" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                )}
                <span className="font-medium">
                  {uploadQueue.every((f) => f.status === "done")
                    ? `Uploaded ${uploadQueue.length} file${uploadQueue.length > 1 ? "s" : ""}`
                    : `Uploading ${uploadQueue.filter((f) => f.status === "done").length}/${uploadQueue.length} files`}
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {uploadQueue.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm py-1">
                    {item.status === "pending" && (
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    {item.status === "uploading" && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    )}
                    {item.status === "done" && <Check className="h-4 w-4 text-success shrink-0" />}
                    {item.status === "error" && <X className="h-4 w-4 text-destructive shrink-0" />}
                    <span className="truncate flex-1">{item.file.name}</span>
                    {item.targetFolder !== folderPath && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        → {item.targetFolder.split("/").pop()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        {/* Top row: path and actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="h-4 w-4" />
            <span className="font-mono">{folderPath || "(root)"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onShowSnippet}>
              <Code className="h-4 w-4 mr-2" />
              Snippet
            </Button>
            <Button variant="outline" size="sm" onClick={onCreateFolder}>
              <Folder className="h-4 w-4 mr-2" />
              New Folder
            </Button>
            <Button variant="outline" size="sm" onClick={onCreateAsset}>
              <Plus className="h-4 w-4 mr-2" />
              New Asset
            </Button>
            <Button size="sm" onClick={onUploadNew}>
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </div>
        </div>

        {/* Bottom row: search, filters, view toggle */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-1">
            {typeFilters.map((filter) => (
              <Button
                key={filter.value}
                variant={typeFilter === filter.value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTypeFilter(filter.value)}
                className="text-xs"
              >
                {filter.label}
              </Button>
            ))}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center border border-border rounded-md">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setViewMode("grid")}
              className="rounded-r-none"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setViewMode("list")}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Active filters */}
        {(searchQuery || typeFilter !== "all") && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filters:</span>
            {searchQuery && (
              <Badge
                variant="secondary"
                className="text-xs cursor-pointer"
                onClick={() => setSearchQuery("")}
              >
                Search: {searchQuery}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            )}
            {typeFilter !== "all" && (
              <Badge
                variant="secondary"
                className="text-xs cursor-pointer"
                onClick={() => setTypeFilter("all")}
              >
                Type: {typeFilter}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {hasNoContent ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="font-medium text-foreground">This folder is empty</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload an asset or create a subfolder to get started
              </p>
            </div>
            <Button onClick={onUploadNew}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Asset
            </Button>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="font-medium text-foreground">No matches found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search or filters
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setTypeFilter("all");
              }}
            >
              Clear Filters
            </Button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {/* Folders first */}
            {filteredFolders.map((folder, index) => (
              <div key={folder._id} className={cn("stagger-" + Math.min(index + 1, 6))}>
                <FolderGridItem
                  folder={folder}
                  onClick={() => onFolderSelect(folder.path)}
                  onMouseEnter={() => handleFolderPrefetch(folder.path)}
                />
              </div>
            ))}
            {/* Then assets */}
            {filteredAssets.map((asset, index) => (
              <div
                key={asset._id}
                className={cn("stagger-" + Math.min(index + filteredFolders.length + 1, 6))}
              >
                <AssetCard
                  asset={asset as AssetData}
                  publishedInfo={publishedInfoMap.get(asset.basename)}
                  onClick={() =>
                    onAssetSelect({ folderPath: asset.folderPath, basename: asset.basename })
                  }
                  onUpload={onUploadNew}
                  onRename={() =>
                    handleRenameClick({ folderPath: asset.folderPath, basename: asset.basename })
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <div>
            {/* Folders first */}
            {filteredFolders.map((folder, index) => (
              <div key={folder._id} className={cn("stagger-" + Math.min(index + 1, 6))}>
                <FolderListItem
                  folder={folder}
                  onClick={() => onFolderSelect(folder.path)}
                  onMouseEnter={() => handleFolderPrefetch(folder.path)}
                />
              </div>
            ))}
            {/* Then assets */}
            {filteredAssets.map((asset, index) => (
              <div
                key={asset._id}
                className={cn("stagger-" + Math.min(index + filteredFolders.length + 1, 6))}
              >
                <AssetListRow
                  asset={asset as AssetData}
                  publishedInfo={publishedInfoMap.get(asset.basename)}
                  onClick={() =>
                    onAssetSelect({ folderPath: asset.folderPath, basename: asset.basename })
                  }
                  onUpload={onUploadNew}
                  onRename={() =>
                    handleRenameClick({ folderPath: asset.folderPath, basename: asset.basename })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newBasename">New name</Label>
              <Input
                id="newBasename"
                value={newBasename}
                onChange={(e) => setNewBasename(e.target.value)}
                placeholder="Enter new filename"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isRenaming) {
                    handleRenameSubmit();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} disabled={isRenaming || !newBasename.trim()}>
              {isRenaming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Renaming...
                </>
              ) : (
                "Rename"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Skeleton shown during direct navigation (before data loads)
export function AssetListSkeleton() {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header skeleton */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-muted animate-pulse" />
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 rounded bg-muted animate-pulse" />
            <div className="h-8 w-24 rounded bg-muted animate-pulse" />
            <div className="h-8 w-20 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-64 rounded bg-muted animate-pulse" />
          <div className="flex gap-1">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-8 w-14 rounded bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </div>
      {/* Grid skeleton */}
      <div className="flex-1 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="aspect-video bg-muted animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="flex gap-1">
                  <div className="h-5 w-16 rounded bg-muted animate-pulse" />
                  <div className="h-5 w-12 rounded bg-muted animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
