"use client";

/**
 * ChapterEditorView - Full chapter editing experience
 *
 * This component replaces the main content area when editing a chapter.
 * It provides:
 * - Full-width Monaco editor with character autocomplete
 * - Collapsible and resizable version history sidebar
 * - Chapter metadata display
 * - Save/publish workflow
 */

import { useState, useMemo, useCallback } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@convex/_generated/api";
import { queries } from "@/lib/queries";
import { ChapterEditor } from "../editors/ChapterEditor";
import { MetadataEditor } from "../editors/MetadataEditor";
import { BookProvider, useBook } from "@/lib/contexts";
import { getBookPathFromAny } from "@/lib/utils/folderPatterns";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, CheckCircle, AlertCircle, Clock, Archive, PanelRightClose, PanelRight, Loader2, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle, usePanelRef } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface ChapterEditorViewProps {
  folderPath: string;
  basename: string;
  selectedVersionId: string | null;
  onVersionSelect: (versionId: string | null) => void;
  onBack: () => void;
}

// =============================================================================
// Inner Component (uses BookProvider context)
// =============================================================================

function ChapterEditorContent({ folderPath, basename, selectedVersionId, onVersionSelect, onBack }: ChapterEditorViewProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarSizeBeforeCollapse, setSidebarSizeBeforeCollapse] = useState<number | null>(null);
  const [metadataExpanded, setMetadataExpanded] = useState(true);
  const sidebarPanelRef = usePanelRef();
  const { metadata: bookMetadata } = useBook();

  // Toggle sidebar collapse
  const toggleSidebar = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (panel) {
      if (sidebarCollapsed) {
        panel.expand();
        // Restore previous size if we have one
        if (sidebarSizeBeforeCollapse !== null) {
          panel.resize(sidebarSizeBeforeCollapse);
        }
      } else {
        // Save current size before collapsing
        setSidebarSizeBeforeCollapse(panel.getSize().inPixels);
        panel.collapse();
      }
    }
  }, [sidebarCollapsed, sidebarSizeBeforeCollapse, sidebarPanelRef]);

  // Query asset and versions
  const { data: asset, isLoading: assetLoading } = useQuery(queries.asset(folderPath, basename));
  const { data: versions, isLoading: versionsLoading, refetch: refetchVersions } = useQuery(queries.assetVersions(folderPath, basename));

  // Mutations
  const publishDraft = useMutation(api.cli.publishDraft);

  // Get the selected version (or latest published)
  const selectedVersion = useMemo(() => {
    if (!versions) return null;
    if (selectedVersionId) {
      return versions.find((v: { _id: string }) => v._id === selectedVersionId);
    }
    // Default to published version
    return versions.find((v: { state: string }) => v.state === "published");
  }, [versions, selectedVersionId]);

  // Check if version has content (either Convex storage or R2)
  const hasContent = selectedVersion?.storageId || selectedVersion?.r2Key;

  // Handle publish
  const handlePublish = useCallback(async () => {
    try {
      await publishDraft({ folderPath, basename });
      toast.success("Draft published successfully");
      refetchVersions();
    } catch (error) {
      toast.error("Failed to publish");
    }
  }, [folderPath, basename, publishDraft, refetchVersions]);

  // Handle save complete
  const handleSaveComplete = useCallback(() => {
    refetchVersions();
  }, [refetchVersions]);

  // Loading state
  if (assetLoading || versionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No asset found
  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Chapter not found</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* Main Editor Area */}
      <ResizablePanel id="chapter-editor" minSize="400px">
        <div className="h-full flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="font-semibold truncate">{basename}</h1>
                <p className="text-xs text-muted-foreground truncate">{bookMetadata?.name || folderPath}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedVersion && (
                <Badge variant={selectedVersion.state as any} className="text-xs">
                  v{selectedVersion.version} ({selectedVersion.state})
                </Badge>
              )}
              {/* Publish button for drafts */}
              {versions?.some((v: { state: string }) => v.state === "draft") && (
                <Button variant="success" size="sm" onClick={handlePublish}>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Publish Draft
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={toggleSidebar} title={sidebarCollapsed ? "Show version history" : "Hide version history"}>
                {sidebarCollapsed ? <PanelRight className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 min-h-0">
            {hasContent && selectedVersion ? (
              <ChapterEditor folderPath={folderPath} basename={basename} versionId={selectedVersion._id} onSaveComplete={handleSaveComplete} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">No content available. Upload a file first.</div>
            )}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      {/* Version History Sidebar */}
      <ResizablePanel
        id="version-history"
        panelRef={sidebarPanelRef}
        defaultSize="280px"
        minSize="200px"
        maxSize="400px"
        collapsible
        collapsedSize="0px"
        onResize={(size) => {
          setSidebarCollapsed(size.inPixels < 10);
        }}
      >
        <div className="h-full border-l border-border bg-card flex flex-col">
          {/* Metadata Section */}
          <div className="border-b border-border">
            <button onClick={() => setMetadataExpanded(!metadataExpanded)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-medium text-sm">Chapter Metadata</h2>
              </div>
              {metadataExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {metadataExpanded && (
              <div className="border-t border-border">
                <MetadataEditor folderPath={folderPath} basename={basename} onSaveComplete={refetchVersions} />
              </div>
            )}
          </div>

          {/* Version History Section */}
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-medium text-sm">Version History</h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {versions && versions.length > 0 ? (
                [...versions].reverse().map((version) => {
                  const isSelected = selectedVersionId === version._id || (!selectedVersionId && version.state === "published");

                  return (
                    <button
                      key={version._id}
                      onClick={() => onVersionSelect(version._id)}
                      className={cn(
                        "w-full text-left p-2 rounded-lg border transition-all text-sm",
                        isSelected ? "ring-2 ring-primary ring-offset-1" : "hover:border-primary/50",
                        version.state === "published"
                          ? "border-success/30 bg-success/5"
                          : version.state === "draft"
                            ? "border-warning/30 bg-warning/5"
                            : "border-border bg-surface-1",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {version.state === "published" ? (
                          <CheckCircle className="h-3 w-3 text-success" />
                        ) : version.state === "draft" ? (
                          <AlertCircle className="h-3 w-3 text-warning" />
                        ) : (
                          <Archive className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="font-medium">v{version.version}</span>
                        <Badge variant={version.state as any} className="text-[10px] ml-auto">
                          {version.state}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No versions yet</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

// =============================================================================
// Exported Component (adds BookProvider if needed)
// =============================================================================

export function ChapterEditorView(props: ChapterEditorViewProps) {
  const bookPath = getBookPathFromAny(props.folderPath);

  if (!bookPath) {
    // Not in a book context, render without provider
    return <ChapterEditorContent {...props} />;
  }

  return (
    <BookProvider bookPath={bookPath}>
      <ChapterEditorContent {...props} />
    </BookProvider>
  );
}
