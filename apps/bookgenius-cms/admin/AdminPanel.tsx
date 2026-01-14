"use client";

import { useState, Suspense, useMemo, useCallback } from "react";
import { Toaster } from "sonner";
import { FolderTree, FolderTreeSkeleton } from "./components/FolderTree";
import { AssetListSkeleton } from "./components/AssetList";
import { BookAwareAssetList, ChapterEditorView } from "./components/book";
import { AssetDetail, AssetDetailSkeleton } from "./components/AssetDetail";
import { CreateFolderDialog } from "./components/CreateFolderDialog";
import { UploadDialog } from "./components/UploadDialog";
import { CodeSnippetDialog } from "./components/CodeSnippetDialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  usePanelRef,
} from "@/components/ui/resizable";
import { Loader2, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================================================
// Helper: Detect specialized asset types
// =============================================================================

type SpecializedAssetType = "chapter" | null;

function detectSpecializedAsset(
  asset: { folderPath: string; basename: string } | null,
): SpecializedAssetType {
  if (!asset) return null;

  const { folderPath, basename } = asset;

  // Check for chapter XML files
  if (folderPath.includes("/chapters") && basename.endsWith(".xml")) {
    return "chapter";
  }

  return null;
}

interface AdminPanelProps {
  folderPath: string;
  selectedAsset: { folderPath: string; basename: string } | null;
  selectedVersionId: string | null;
  onFolderSelect: (folderPath: string) => void;
  onAssetSelect: (asset: { folderPath: string; basename: string } | null) => void;
  onVersionSelect: (versionId: string | null) => void;
}

export function AdminPanel({
  folderPath,
  selectedAsset,
  selectedVersionId,
  onFolderSelect,
  onAssetSelect,
  onVersionSelect,
}: AdminPanelProps) {
  // Dialog state (local, not URL-based)
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createFolderParentPath, setCreateFolderParentPath] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBasename, setUploadBasename] = useState<string | undefined>();
  const [snippetOpen, setSnippetOpen] = useState(false);

  const [optimisticAvatars, setOptimisticAvatars] = useState<Record<string, string>>({});

  // Panel state for responsive sidebars
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [leftSizeBeforeCollapse, setLeftSizeBeforeCollapse] = useState<number | null>(null);
  const leftPanelRef = usePanelRef();

  // Toggle left sidebar
  const toggleLeftSidebar = useCallback(() => {
    const panel = leftPanelRef.current;
    if (panel) {
      if (leftCollapsed) {
        panel.expand();
        // Restore previous size if we have one
        if (leftSizeBeforeCollapse !== null) {
          panel.resize(leftSizeBeforeCollapse);
        }
      } else {
        // Save current size before collapsing
        setLeftSizeBeforeCollapse(panel.getSize().inPixels);
        panel.collapse();
      }
    }
  }, [leftCollapsed, leftSizeBeforeCollapse, leftPanelRef]);

  // Handlers
  const handleCreateFolder = (parentPath: string) => {
    setCreateFolderParentPath(parentPath);
    setCreateFolderOpen(true);
  };

  const handleUploadNew = () => {
    setUploadBasename(undefined);
    setUploadOpen(true);
  };

  const handleUploadNewVersion = (basename: string) => {
    setUploadBasename(basename);
    setUploadOpen(true);
  };

  const handleUploadComplete = useCallback(
    (uploadFolderPath: string, basename: string, file: File) => {
      if (basename.startsWith("avatar-large.")) {
        const objectUrl = URL.createObjectURL(file);
        setOptimisticAvatars((prev) => ({ ...prev, [uploadFolderPath]: objectUrl }));
      }
    },
    [],
  );

  const handleCloseDetail = () => {
    onAssetSelect(null);
  };

  // Detect if we're viewing a specialized asset type
  const specializedType = useMemo(() => detectSpecializedAsset(selectedAsset), [selectedAsset]);

  // Render specialized editors for certain asset types
  const renderSpecializedEditor = () => {
    if (!selectedAsset || !specializedType) return null;

    switch (specializedType) {
      case "chapter":
        return (
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ChapterEditorView
              folderPath={selectedAsset.folderPath}
              basename={selectedAsset.basename}
              selectedVersionId={selectedVersionId}
              onVersionSelect={onVersionSelect}
              onBack={handleCloseDetail}
            />
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background">
        {/* Main Content */}
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          {/* Left: Folder Tree */}
          <ResizablePanel
            id="left-sidebar"
            panelRef={leftPanelRef}
            defaultSize="240px"
            minSize="180px"
            maxSize="400px"
            collapsible
            collapsedSize="0px"
            onResize={(size) => {
              // Track collapsed state based on panel size
              setLeftCollapsed(size.inPixels < 10);
            }}
          >
            <div className="h-full flex flex-col">
              <Suspense fallback={<FolderTreeSkeleton onToggleCollapse={toggleLeftSidebar} />}>
                <FolderTree
                  selectedFolderPath={folderPath}
                  onFolderSelect={onFolderSelect}
                  onCreateFolder={handleCreateFolder}
                  onToggleCollapse={toggleLeftSidebar}
                />
              </Suspense>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* Middle + Right Content */}
          <ResizablePanel id="main-content" minSize="400px">
            <div className="h-full flex">
              {/* Collapsed sidebar toggle - shown when left panel is collapsed */}
              {leftCollapsed && (
                <div className="h-full flex flex-col border-r border-border bg-sidebar shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="m-2"
                    onClick={toggleLeftSidebar}
                    title="Expand sidebar"
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Specialized Editor (replaces middle + right panels) */}
              {specializedType ? (
                <div className="flex-1 h-full flex flex-col min-w-0">
                  {renderSpecializedEditor()}
                </div>
              ) : (
                <ResizablePanelGroup orientation="horizontal" className="flex-1 h-full">
                  {/* Middle: Asset List (book-aware) */}
                  <ResizablePanel id="asset-list" minSize="300px">
                    <div className="h-full flex flex-col">
                      <Suspense fallback={<AssetListSkeleton />}>
                        <BookAwareAssetList
                          folderPath={folderPath}
                          onAssetSelect={onAssetSelect}
                          onFolderSelect={onFolderSelect}
                          onUploadNew={handleUploadNew}
                          onUploadAsset={handleUploadNewVersion}
                          onCreateAsset={() => {
                            handleUploadNew();
                          }}
                          onCreateFolder={() => handleCreateFolder(folderPath)}
                          onShowSnippet={() => setSnippetOpen(true)}
                          optimisticAvatars={optimisticAvatars}
                        />
                      </Suspense>
                    </div>
                  </ResizablePanel>

                  {/* Right: Asset Detail (conditional) */}
                  {selectedAsset && (
                    <>
                      <ResizableHandle />
                      <ResizablePanel
                        id="asset-detail"
                        defaultSize="350px"
                        minSize="280px"
                        maxSize="500px"
                      >
                        <div className="h-full flex flex-col">
                          <Suspense fallback={<AssetDetailSkeleton />}>
                            <AssetDetail
                              folderPath={selectedAsset.folderPath}
                              basename={selectedAsset.basename}
                              selectedVersionId={selectedVersionId}
                              onVersionSelect={onVersionSelect}
                              onClose={handleCloseDetail}
                              onUploadNew={() => handleUploadNewVersion(selectedAsset.basename)}
                            />
                          </Suspense>
                        </div>
                      </ResizablePanel>
                    </>
                  )}
                </ResizablePanelGroup>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Dialogs */}
        <CreateFolderDialog
          open={createFolderOpen}
          onOpenChange={setCreateFolderOpen}
          parentPath={createFolderParentPath}
        />

        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          folderPath={folderPath}
          existingBasename={uploadBasename}
          onUploadComplete={handleUploadComplete}
        />

        <CodeSnippetDialog
          open={snippetOpen}
          onOpenChange={setSnippetOpen}
          folderPath={folderPath}
        />

        {/* Toast notifications */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              color: "var(--color-foreground)",
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}
