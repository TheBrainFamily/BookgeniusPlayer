"use client";

/**
 * BackgroundCuesView - Cue Sheet view for background cues
 *
 * Shows all background cue points for a book grouped by chapter.
 * Supports both video and image backgrounds.
 * Switch to "Files" view to see raw file list.
 */

import { useState, useMemo, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useBackgroundCues, useChapters, useBook } from "@/lib/contexts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Plus, Video, Image as ImageIcon, List, FolderOpen, Trash2, Pencil } from "lucide-react";
import { Id } from "@convex/_generated/dataModel";
import { AddBackgroundCueDialog } from "../dialogs/AddBackgroundCueDialog";

// =============================================================================
// Types
// =============================================================================

interface BackgroundCuesViewProps {
  folderPath: string;
  onAssetSelect: (asset: { folderPath: string; basename: string }) => void;
  onFolderSelect: (path: string) => void;
  onUploadNew: () => void;
  onUploadAsset: (basename: string) => void;
  onCreateAsset: () => void;
  onCreateFolder: () => void;
  onShowSnippet: () => void;
}

type ViewMode = "cuesheet" | "files";

// =============================================================================
// Helper: Detect if file is image or video
// =============================================================================

function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(ext || "");
}

// =============================================================================
// Cue Row Component
// =============================================================================

interface CueRowProps {
  cue: {
    _id: Id<"backgroundCues">;
    fileBasename: string;
    chapter: number;
    paragraph: number;
    url?: string;
    backgroundColor?: string;
    textColor?: string;
    previewMp4Url?: string;
    previewWebpUrl?: string;
    previewStatus?: string;
  };
  isReused: boolean;
  onEdit: (cue: CueRowProps["cue"]) => void;
  onDelete: (id: Id<"backgroundCues">) => void;
  onParagraphEdit: (id: Id<"backgroundCues">, newParagraph: number) => void;
}

function CueRow({ cue, isReused, onEdit, onDelete, onParagraphEdit }: CueRowProps) {
  const [isEditingParagraph, setIsEditingParagraph] = useState(false);
  const [paragraphValue, setParagraphValue] = useState(String(cue.paragraph));
  const isImage = isImageFile(cue.fileBasename);

  const handleParagraphSubmit = () => {
    const newValue = parseInt(paragraphValue, 10);
    if (!isNaN(newValue) && newValue >= 0) {
      onParagraphEdit(cue._id, newValue);
    }
    setIsEditingParagraph(false);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 group cursor-pointer" onClick={() => onEdit(cue)}>
      {/* Paragraph number - clickable to edit */}
      {isEditingParagraph ? (
        <Input
          type="number"
          value={paragraphValue}
          onChange={(e) => setParagraphValue(e.target.value)}
          onBlur={handleParagraphSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleParagraphSubmit();
            if (e.key === "Escape") setIsEditingParagraph(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-16 h-7 text-sm font-mono"
          autoFocus
        />
      ) : (
        <button
          className="text-muted-foreground font-mono text-sm w-16 text-left hover:text-foreground hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditingParagraph(true);
          }}
          title="Click to edit paragraph"
        >
          ¶{cue.paragraph}
        </button>
      )}

      {/* Preview - priority: video preview > webp thumbnail > original */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {cue.previewMp4Url ? (
          // Video preview available - show looping video with poster
          <video className="h-16 w-24 object-cover rounded border" autoPlay loop muted playsInline poster={cue.previewWebpUrl}>
            <source src={cue.previewMp4Url} type="video/mp4" />
          </video>
        ) : cue.previewWebpUrl ? (
          // Only webp thumbnail available (image or video still processing)
          <img src={cue.previewWebpUrl} alt={cue.fileBasename} className="h-16 w-24 object-cover rounded border" />
        ) : cue.url ? (
          isImage ? (
            // Original image (no preview yet)
            <img src={cue.url} alt={cue.fileBasename} className="h-16 w-24 object-cover rounded border" />
          ) : (
            // Original video (no preview yet) - loads just metadata/first frame
            <video src={cue.url} className="h-16 w-24 object-cover rounded border" muted preload="metadata" />
          )
        ) : (
          <div className="h-16 w-24 bg-muted rounded border flex items-center justify-center">
            {isImage ? <ImageIcon className="h-6 w-6 text-muted-foreground" /> : <Video className="h-6 w-6 text-muted-foreground" />}
          </div>
        )}
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-medium truncate">{cue.fileBasename}</span>
          {isReused && (
            <Badge variant="secondary" className="text-xs w-fit">
              reused
            </Badge>
          )}
        </div>
      </div>

      {/* Color swatches */}
      <div className="flex items-center gap-2">
        {cue.backgroundColor && <div className="h-8 w-8 rounded border" style={{ backgroundColor: cue.backgroundColor }} title={`Background: ${cue.backgroundColor}`} />}
        {cue.textColor && <div className="h-8 w-8 rounded border" style={{ backgroundColor: cue.textColor }} title={`Text: ${cue.textColor}`} />}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(cue);
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(cue._id);
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Chapter Header Component
// =============================================================================

interface ChapterHeaderProps {
  chapterNumber: number;
  cueCount: number;
  onAddCue: (chapter: number) => void;
}

function ChapterHeader({ chapterNumber, cueCount, onAddCue }: ChapterHeaderProps) {
  return (
    <div className="px-4 py-2 bg-muted/50 border-y flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">Chapter {chapterNumber}</span>
        {cueCount > 0 && (
          <Badge variant="outline" className="text-xs">
            {cueCount} {cueCount === 1 ? "cue" : "cues"}
          </Badge>
        )}
      </div>
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onAddCue(chapterNumber)}>
        <Plus className="h-4 w-4 mr-1" />
        Add
      </Button>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function BackgroundCuesView({
  folderPath,
  onAssetSelect,
  onFolderSelect,
  onUploadNew,
  onUploadAsset,
  onCreateAsset,
  onCreateFolder,
  onShowSnippet,
}: BackgroundCuesViewProps) {
  const { cues, files, isLoading } = useBackgroundCues();
  const { chapters } = useChapters();
  const { bookPath } = useBook();
  const [viewMode, setViewMode] = useState<ViewMode>("cuesheet");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogChapter, setAddDialogChapter] = useState(1);

  const deleteCue = useMutation(api.backgroundCues.remove);
  const updatePosition = useMutation(api.backgroundCues.updatePosition);

  // Get all chapter numbers from chapters data
  const allChapterNumbers = useMemo(() => {
    if (!chapters || chapters.length === 0) return [1];
    return chapters.map((c) => c.chapterNumber).sort((a, b) => a - b);
  }, [chapters]);

  // Group cues by chapter for cue sheet view
  const cuesByChapter = useMemo(() => {
    const map = new Map<number, NonNullable<typeof cues>>();
    // Initialize all chapters
    for (const chNum of allChapterNumbers) {
      map.set(chNum, []);
    }
    // Add cues to their chapters
    if (cues) {
      for (const cue of cues) {
        const chapter = cue.chapter;
        if (!map.has(chapter)) {
          map.set(chapter, []);
        }
        map.get(chapter)!.push(cue);
      }
    }
    return map;
  }, [cues, allChapterNumbers]);

  // Count file usage for "reused" badge
  const fileUsageCount = useMemo(() => {
    if (!cues) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const cue of cues) {
      counts.set(cue.fileBasename, (counts.get(cue.fileBasename) || 0) + 1);
    }
    return counts;
  }, [cues]);

  const handleDeleteCue = useCallback(
    async (id: Id<"backgroundCues">) => {
      await deleteCue({ id });
    },
    [deleteCue],
  );

  const handleParagraphEdit = useCallback(
    async (id: Id<"backgroundCues">, newParagraph: number) => {
      const cue = cues?.find((c) => c._id === id);
      if (cue) {
        await updatePosition({ id, chapter: cue.chapter, paragraph: newParagraph });
      }
    },
    [cues, updatePosition],
  );

  const handleEditCue = useCallback(
    (cue: { fileBasename: string }) => {
      // Navigate to the asset in the file view
      onAssetSelect({ folderPath, basename: cue.fileBasename });
    },
    [folderPath, onAssetSelect],
  );

  const handleAddCue = useCallback((chapter: number) => {
    setAddDialogChapter(chapter);
    setAddDialogOpen(true);
  }, []);

  // Loading state
  if (isLoading) {
    return <BackgroundCuesViewSkeleton />;
  }

  // Get sorted chapter numbers (all chapters, even empty ones)
  const sortedChapters = Array.from(cuesByChapter.keys()).sort((a, b) => a - b);

  // If in files mode, use AssetList - import dynamically to avoid circular deps
  if (viewMode === "files") {
    // We need to pass through to the regular asset list
    const AssetList = require("../AssetList").AssetList;
    return (
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="shrink-0 border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-medium">Backgrounds</h2>
            <Badge variant="outline">{files?.length || 0} files</Badge>
          </div>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="cuesheet" className="h-7 px-2">
                <List className="h-4 w-4 mr-1" />
                Cues
              </TabsTrigger>
              <TabsTrigger value="files" className="h-7 px-2">
                <FolderOpen className="h-4 w-4 mr-1" />
                Files
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <AssetList
          folderPath={folderPath}
          onAssetSelect={onAssetSelect}
          onFolderSelect={onFolderSelect}
          onUploadNew={onUploadNew}
          onUploadAsset={onUploadAsset}
          onCreateAsset={onCreateAsset}
          onCreateFolder={onCreateFolder}
          onShowSnippet={onShowSnippet}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-medium">Background Cues</h2>
          <Badge variant="secondary">{cues?.length || 0} cues</Badge>
          <Badge variant="outline">{files?.length || 0} files</Badge>
        </div>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList className="h-8">
            <TabsTrigger value="cuesheet" className="h-7 px-2">
              <List className="h-4 w-4 mr-1" />
              Cues
            </TabsTrigger>
            <TabsTrigger value="files" className="h-7 px-2">
              <FolderOpen className="h-4 w-4 mr-1" />
              Files
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {sortedChapters.map((chapter) => {
            const chapterCues = cuesByChapter.get(chapter) || [];
            return (
              <div key={chapter} className="mb-2">
                <ChapterHeader chapterNumber={chapter} cueCount={chapterCues.length} onAddCue={handleAddCue} />
                {chapterCues.length > 0 ? (
                  chapterCues.map((cue) => (
                    <CueRow
                      key={cue._id}
                      cue={cue}
                      isReused={(fileUsageCount.get(cue.fileBasename) || 0) > 1}
                      onEdit={handleEditCue}
                      onDelete={handleDeleteCue}
                      onParagraphEdit={handleParagraphEdit}
                    />
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">No backgrounds set for this chapter</div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Add Cue Dialog */}
      <AddBackgroundCueDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} chapter={addDialogChapter} />
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

export function BackgroundCuesViewSkeleton() {
  return (
    <div className="flex-1 flex flex-col animate-pulse">
      <div className="shrink-0 border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-muted rounded" />
          <div className="h-5 w-32 bg-muted rounded" />
        </div>
        <div className="h-8 w-40 bg-muted rounded" />
      </div>
      <div className="flex-1 p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-8 w-full bg-muted rounded" />
            <div className="h-20 w-full bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
