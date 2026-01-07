"use client";

/**
 * ChaptersView - View for a book's chapters
 *
 * Shows chapter list with ability to create new chapters.
 * Clicking a chapter opens the ChapterEditor.
 */

import { useState, useCallback } from "react";
import { useChapters, useBook } from "@/lib/contexts";
import { CreateChapterDialog } from "../dialogs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, ScrollText, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface ChaptersViewProps {
  onChapterSelect: (asset: { folderPath: string; basename: string }) => void;
}

// =============================================================================
// Component
// =============================================================================

export function ChaptersView({ onChapterSelect }: ChaptersViewProps) {
  const { chapters, isLoading } = useChapters();
  const { bookPath } = useBook();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Handle create button click
  const handleCreateClick = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  // Handle chapter created
  const handleChapterCreated = useCallback(
    (folderPath: string, basename: string) => {
      onChapterSelect({ folderPath, basename });
    },
    [onChapterSelect],
  );

  // Loading state
  if (isLoading) {
    return <ChaptersViewSkeleton />;
  }

  // Empty state
  if (!chapters || chapters.length === 0) {
    return (
      <>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <ScrollText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <h3 className="font-medium text-foreground">No chapters yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first chapter to get started
            </p>
          </div>
          <Button onClick={handleCreateClick}>
            <Plus className="h-4 w-4 mr-2" />
            Create Chapter
          </Button>
        </div>

        <CreateChapterDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          bookPath={bookPath}
          onCreated={handleChapterCreated}
        />
      </>
    );
  }

  // Sort chapters by chapter number
  const sortedChapters = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Chapters</span>
            <Badge variant="secondary">{chapters.length}</Badge>
          </div>
          <Button size="sm" onClick={handleCreateClick}>
            <Plus className="h-4 w-4 mr-2" />
            Add Chapter
          </Button>
        </div>
      </div>

      {/* Chapter List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {sortedChapters.map((chapter) => {
            const isPublished = !!chapter.publishedAt;

            return (
              <button
                key={chapter.path}
                onClick={() =>
                  onChapterSelect({
                    folderPath: `${bookPath}/chapters`,
                    basename: chapter.basename,
                  })
                }
                className={cn(
                  "w-full text-left p-4 rounded-lg border transition-all",
                  "hover:border-primary/50 hover:bg-accent/50",
                  "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  isPublished ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Chapter {chapter.chapterNumber}</span>
                      {isPublished ? (
                        <Badge variant="published" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="draft" className="text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Draft
                        </Badge>
                      )}
                    </div>
                    {chapter.title && (
                      <p className="text-sm text-muted-foreground truncate">{chapter.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{chapter.basename}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Create Chapter Dialog */}
      <CreateChapterDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        bookPath={bookPath}
        onCreated={handleChapterCreated}
      />
    </div>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

export function ChaptersViewSkeleton() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-muted animate-pulse" />
            <div className="h-5 w-20 rounded bg-muted animate-pulse" />
            <div className="h-5 w-8 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-8 w-28 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-4 rounded-lg border border-border">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                <div className="h-3 w-48 rounded bg-muted animate-pulse" />
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
