"use client";

/**
 * AddMusicCueDialog - Dialog for adding a new music cue point
 *
 * Lets user select a music file and set the paragraph number.
 * Chapter is pre-selected from the context.
 */

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useBook, useMusicCues } from "@/lib/contexts";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Music, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface AddMusicCueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected chapter number */
  chapter: number;
  /** Called after successful creation */
  onCreated?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function AddMusicCueDialog({ open, onOpenChange, chapter, onCreated }: AddMusicCueDialogProps) {
  const { bookPath } = useBook();
  const { files } = useMusicCues();

  // Form state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [paragraph, setParagraph] = useState("0");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mutation
  const createCue = useMutation(api.musicCues.create);

  // Handle create
  const handleCreate = useCallback(async () => {
    if (!selectedFile) {
      setError("Please select a music file");
      return;
    }
    const paragraphNum = parseInt(paragraph, 10);
    if (isNaN(paragraphNum) || paragraphNum < 0) {
      setError("Please enter a valid paragraph number (0 or higher)");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await createCue({ bookPath, fileBasename: selectedFile, chapter, paragraph: paragraphNum });

      toast.success(`Music cue added at Chapter ${chapter}, ¶${paragraphNum}`);
      onOpenChange(false);
      onCreated?.();

      // Reset form
      setSelectedFile(null);
      setParagraph("0");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create cue";
      setError(message);
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [bookPath, selectedFile, chapter, paragraph, createCue, onOpenChange, onCreated]);

  // Handle close
  const handleClose = useCallback(() => {
    if (!isCreating) {
      onOpenChange(false);
      setSelectedFile(null);
      setParagraph("0");
      setError(null);
    }
  }, [isCreating, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Add Music Cue
          </DialogTitle>
          <DialogDescription>Add a music track to Chapter {chapter}. Select a file and set the paragraph where it should start.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Selection */}
          <div className="space-y-2">
            <Label>
              Music File <span className="text-destructive">*</span>
            </Label>
            {files && files.length > 0 ? (
              <ScrollArea className="h-48 border rounded-md">
                <div className="p-2 space-y-1">
                  {files.map((file) => {
                    const isSelected = selectedFile === file.basename;
                    return (
                      <button
                        key={file.basename}
                        onClick={() => setSelectedFile(file.basename)}
                        className={cn(
                          "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                          isSelected ? "bg-primary/10 border border-primary" : "hover:bg-accent",
                        )}
                        disabled={isCreating}
                      >
                        {/* Cover art or icon */}
                        <div className="h-10 w-10 rounded border overflow-hidden shrink-0">
                          {file.coverUrl ? (
                            <img src={file.coverUrl} alt={file.basename} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-muted flex items-center justify-center">
                              <Music className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        {/* Name and artist */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{file.title || file.basename}</div>
                          {file.artist && <div className="text-xs text-muted-foreground truncate">{file.artist}</div>}
                        </div>
                        {/* Selected indicator */}
                        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="h-24 border rounded-md flex items-center justify-center text-sm text-muted-foreground">No music files available. Upload some files first.</div>
            )}
          </div>

          {/* Paragraph */}
          <div className="space-y-2">
            <Label htmlFor="paragraph">
              Paragraph <span className="text-destructive">*</span>
            </Label>
            <Input id="paragraph" type="number" min="0" value={paragraph} onChange={(e) => setParagraph(e.target.value)} placeholder="0" disabled={isCreating} className="w-32" />
            <p className="text-xs text-muted-foreground">0 = start of chapter</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !selectedFile}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Cue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
