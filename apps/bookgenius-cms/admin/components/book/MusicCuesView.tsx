/* eslint-disable react-hooks/set-state-in-effect */
"use client";

/**
 * MusicCuesView - Cue Sheet view for music cues
 *
 * Shows all music cue points for a book grouped by chapter.
 * Multiple tracks at the same chapter/paragraph are grouped together.
 * Drag-and-drop reordering within groups is supported.
 * Switch to "Files" view to see file list with cover art.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useMusicCues, useChapters, useBook } from "@/lib/contexts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Plus, Music, List, FolderOpen, Trash2, Upload, GripVertical } from "lucide-react";
import { type Id } from "@convex/_generated/dataModel";
import { AddMusicCueDialog } from "../dialogs/AddMusicCueDialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// =============================================================================
// Types
// =============================================================================

interface MusicCuesViewProps {
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

type CueData = {
  _id: Id<"musicCues">;
  fileBasename: string;
  chapter: number;
  paragraph: number;
  order: number;
  url?: string;
  coverUrl?: string;
  title?: string;
  artist?: string;
};

// =============================================================================
// Sortable Cue Card Component (for grouped display with drag-and-drop)
// =============================================================================

interface SortableCueCardProps {
  cue: CueData;
  isReused: boolean;
  onEdit: (cue: CueData) => void;
  onDelete: (id: Id<"musicCues">) => void;
  compact?: boolean;
  isDraggable?: boolean;
}

function SortableCueCard({
  cue,
  isReused,
  onEdit,
  onDelete,
  compact,
  isDraggable,
}: SortableCueCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cue._id,
    // Disable layout animation to prevent snap-back glitch on drop
    animateLayoutChanges: () => false,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    // Only apply transition while actively dragging, not on drop
    transition: isDragging ? transition : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 group cursor-pointer border bg-card"
      onClick={() => onEdit(cue)}
    >
      {/* Drag handle - only show when draggable */}
      {isDraggable && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none shrink-0 p-1 -ml-1 rounded hover:bg-muted"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Cover art */}
      <div
        className={`${compact ? "h-10 w-10" : "h-12 w-12"} rounded border overflow-hidden shrink-0`}
      >
        {cue.coverUrl ? (
          <img src={cue.coverUrl} alt={cue.fileBasename} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-muted flex items-center justify-center">
            <Music className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-muted-foreground`} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-medium truncate">{cue.title || cue.fileBasename}</span>
        {cue.artist && <span className="text-xs text-muted-foreground truncate">{cue.artist}</span>}
        {isReused && (
          <Badge variant="secondary" className="text-xs w-fit">
            reused
          </Badge>
        )}
      </div>

      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(cue._id);
        }}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}

// =============================================================================
// Grouped Cue Row Component (shows cues at same chapter/paragraph)
// =============================================================================

interface GroupedCueRowProps {
  paragraph: number;
  cues: CueData[];
  fileUsageCount: Map<string, number>;
  onEdit: (cue: CueData) => void;
  onDelete: (id: Id<"musicCues">) => void;
  onParagraphEdit: (ids: Id<"musicCues">[], newParagraph: number) => void;
  onReorder: (cueIds: Id<"musicCues">[]) => void;
}

function GroupedCueRow({
  paragraph,
  cues,
  fileUsageCount,
  onEdit,
  onDelete,
  onParagraphEdit,
  onReorder,
}: GroupedCueRowProps) {
  const [isEditingParagraph, setIsEditingParagraph] = useState(false);
  const [paragraphValue, setParagraphValue] = useState(String(paragraph));

  // Local state for immediate visual reordering
  const [localCues, setLocalCues] = useState(cues);

  // Sync local state when server data changes
  // We use a key based on IDs to detect when we need to sync
  const serverCueKey = cues.map((c) => `${c._id}:${c.order}`).join(",");
  useEffect(() => {
    setLocalCues(cues);
  }, [serverCueKey]); // Only sync when server order actually changes

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleParagraphSubmit = () => {
    const newValue = parseInt(paragraphValue, 10);
    if (!isNaN(newValue) && newValue >= 0 && newValue !== paragraph) {
      onParagraphEdit(
        cues.map((c) => c._id),
        newValue,
      );
    }
    setIsEditingParagraph(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localCues.findIndex((c) => c._id === active.id);
      const newIndex = localCues.findIndex((c) => c._id === over.id);
      const newOrder = arrayMove(localCues, oldIndex, newIndex);

      // Update local state immediately for instant visual feedback
      setLocalCues(newOrder);

      // Then sync with server
      onReorder(newOrder.map((c) => c._id));
    }
  };

  const isMultipleCues = localCues.length > 1;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
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
          className="w-16 h-7 text-sm font-mono shrink-0"
          autoFocus
        />
      ) : (
        <button
          className="text-muted-foreground font-mono text-sm w-16 text-left hover:text-foreground hover:underline pt-2 shrink-0"
          onClick={() => setIsEditingParagraph(true)}
          title="Click to edit paragraph"
        >
          ¶{paragraph}
        </button>
      )}

      {/* Cue cards - with drag-and-drop for multiple cues */}
      {isMultipleCues ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={localCues.map((c) => c._id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex-1 flex flex-col sm:flex-row gap-2">
              {localCues.map((cue) => (
                <div key={cue._id} className="flex-1 min-w-0 sm:max-w-[50%]">
                  <SortableCueCard
                    cue={cue}
                    isReused={(fileUsageCount.get(cue.fileBasename) || 0) > 1}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    compact
                    isDraggable
                  />
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="flex-1">
          {localCues.map((cue) => (
            <SortableCueCard
              key={cue._id}
              cue={cue}
              isReused={(fileUsageCount.get(cue.fileBasename) || 0) > 1}
              onEdit={onEdit}
              onDelete={onDelete}
              compact={false}
              isDraggable={false}
            />
          ))}
        </div>
      )}
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
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        onClick={() => onAddCue(chapterNumber)}
      >
        <Plus className="h-4 w-4 mr-1" />
        Add
      </Button>
    </div>
  );
}

// =============================================================================
// Music File Card Component (for Files view)
// =============================================================================

interface MusicFileCardProps {
  file: {
    basename: string;
    url?: string;
    coverUrl?: string;
    title?: string;
    artist?: string;
    duration?: number;
  };
  onSelect: () => void;
}

function MusicFileCard({ file, onSelect }: MusicFileCardProps) {
  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={onSelect}
    >
      {/* Cover art */}
      <div className="h-14 w-14 rounded-md border overflow-hidden shrink-0">
        {file.coverUrl ? (
          <img src={file.coverUrl} alt={file.basename} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-muted flex items-center justify-center">
            <Music className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm font-medium truncate">{file.title || file.basename}</span>
        {file.artist && (
          <span className="text-xs text-muted-foreground truncate">{file.artist}</span>
        )}
        <span className="text-xs text-muted-foreground truncate">{file.basename}</span>
      </div>

      {/* Duration */}
      {file.duration && (
        <span className="text-xs text-muted-foreground shrink-0">
          {formatDuration(file.duration)}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function MusicCuesView({ folderPath, onAssetSelect, onUploadNew }: MusicCuesViewProps) {
  const { cues, files, isLoading } = useMusicCues();
  const { chapters } = useChapters();
  const { bookPath } = useBook();
  const [viewMode, setViewMode] = useState<ViewMode>("cuesheet");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogChapter, setAddDialogChapter] = useState(1);

  const deleteCue = useMutation(api.musicCues.remove);
  const updatePosition = useMutation(api.musicCues.updatePosition);
  const reorderCues = useMutation(api.musicCues.reorder).withOptimisticUpdate(
    (localStore, { cueIds }) => {
      // Get current cues from cache
      const currentCues = localStore.getQuery(api.musicCues.listByBook, { bookPath });
      if (!currentCues) return;

      // Create new order map
      const orderMap = new Map(cueIds.map((id, idx) => [id, idx]));

      // Update order in cached cues
      const updatedCues = currentCues.map((cue) => ({
        ...cue,
        order: orderMap.has(cue._id) ? orderMap.get(cue._id)! : cue.order,
      }));

      // Re-sort by chapter, paragraph, order
      updatedCues.sort((a, b) => {
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        if (a.paragraph !== b.paragraph) return a.paragraph - b.paragraph;
        return a.order - b.order;
      });

      localStore.setQuery(api.musicCues.listByBook, { bookPath }, updatedCues);
    },
  );

  // Get all chapter numbers from chapters data
  const allChapterNumbers = useMemo(() => {
    if (!chapters || chapters.length === 0) return [1];
    return chapters.map((c) => c.chapterNumber).sort((a, b) => a - b);
  }, [chapters]);

  // Group cues by chapter, then by paragraph within each chapter
  const cuesByChapterAndParagraph = useMemo(() => {
    const chapterMap = new Map<number, Map<number, CueData[]>>();

    // Initialize all chapters
    for (const chNum of allChapterNumbers) {
      chapterMap.set(chNum, new Map());
    }

    // Group cues
    if (cues) {
      for (const cue of cues) {
        if (!chapterMap.has(cue.chapter)) {
          chapterMap.set(cue.chapter, new Map());
        }
        const paragraphMap = chapterMap.get(cue.chapter)!;
        if (!paragraphMap.has(cue.paragraph)) {
          paragraphMap.set(cue.paragraph, []);
        }
        paragraphMap.get(cue.paragraph)!.push(cue);
      }
    }

    return chapterMap;
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
    async (id: Id<"musicCues">) => {
      await deleteCue({ id });
    },
    [deleteCue],
  );

  const handleParagraphEdit = useCallback(
    async (ids: Id<"musicCues">[], newParagraph: number) => {
      // Update all cues in the group to the new paragraph
      for (const id of ids) {
        const cue = cues?.find((c) => c._id === id);
        if (cue) {
          await updatePosition({ id, chapter: cue.chapter, paragraph: newParagraph });
        }
      }
    },
    [cues, updatePosition],
  );

  const handleReorder = useCallback(
    async (cueIds: Id<"musicCues">[]) => {
      await reorderCues({ cueIds });
    },
    [reorderCues],
  );

  const handleEditCue = useCallback(
    (cue: CueData) => {
      // Navigate to the asset in the file view
      onAssetSelect({ folderPath, basename: cue.fileBasename });
    },
    [folderPath, onAssetSelect],
  );

  const handleAddCue = useCallback((chapter: number) => {
    setAddDialogChapter(chapter);
    setAddDialogOpen(true);
  }, []);

  const handleFileSelect = useCallback(
    (basename: string) => {
      onAssetSelect({ folderPath, basename });
    },
    [folderPath, onAssetSelect],
  );

  // Loading state
  if (isLoading) {
    return <MusicCuesViewSkeleton />;
  }

  // Get sorted chapter numbers
  const sortedChapters = Array.from(cuesByChapterAndParagraph.keys()).sort((a, b) => a - b);

  // Files view with covers
  if (viewMode === "files") {
    return (
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="shrink-0 border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-medium">Music Files</h2>
            <Badge variant="outline">{files?.length || 0} files</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={onUploadNew}>
              <Upload className="h-4 w-4 mr-1" />
              Upload
            </Button>
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
        </div>

        {/* Files grid */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {files && files.length > 0 ? (
              files.map((file) => (
                <MusicFileCard
                  key={file.basename}
                  file={file}
                  onSelect={() => handleFileSelect(file.basename)}
                />
              ))
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No music files uploaded yet.
                <br />
                <Button variant="link" className="mt-2" onClick={onUploadNew}>
                  Upload your first track
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Cues view
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-medium">Music Cues</h2>
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
            const paragraphMap = cuesByChapterAndParagraph.get(chapter)!;
            const totalCues = Array.from(paragraphMap.values()).reduce(
              (sum, cues) => sum + cues.length,
              0,
            );
            const sortedParagraphs = Array.from(paragraphMap.keys()).sort((a, b) => a - b);

            return (
              <div key={chapter} className="mb-2">
                <ChapterHeader
                  chapterNumber={chapter}
                  cueCount={totalCues}
                  onAddCue={handleAddCue}
                />
                {sortedParagraphs.length > 0 ? (
                  sortedParagraphs.map((paragraph) => {
                    const paragraphCues = paragraphMap.get(paragraph)!;
                    return (
                      <GroupedCueRow
                        key={`${chapter}-${paragraph}`}
                        paragraph={paragraph}
                        cues={paragraphCues}
                        fileUsageCount={fileUsageCount}
                        onEdit={handleEditCue}
                        onDelete={handleDeleteCue}
                        onParagraphEdit={handleParagraphEdit}
                        onReorder={handleReorder}
                      />
                    );
                  })
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No music set for this chapter
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Add Cue Dialog */}
      <AddMusicCueDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        chapter={addDialogChapter}
      />
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

export function MusicCuesViewSkeleton() {
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
            <div className="h-16 w-full bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
