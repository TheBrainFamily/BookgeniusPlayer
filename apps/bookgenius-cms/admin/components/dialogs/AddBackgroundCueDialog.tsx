"use client";

/**
 * AddBackgroundCueDialog - Dialog for adding a new background cue point
 *
 * Lets user select a background file and set the paragraph number.
 * Chapter is pre-selected from the context.
 */

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useBook, useBackgroundCues } from "@/lib/contexts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Video, Image as ImageIcon, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface AddBackgroundCueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected chapter number */
  chapter: number;
  /** Called after successful creation */
  onCreated?: () => void;
}

// =============================================================================
// Helper
// =============================================================================

function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(ext || "");
}

// =============================================================================
// Component
// =============================================================================

export function AddBackgroundCueDialog({
  open,
  onOpenChange,
  chapter,
  onCreated,
}: AddBackgroundCueDialogProps) {
  const { bookPath } = useBook();
  const { files } = useBackgroundCues();

  // Form state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [paragraph, setParagraph] = useState("0");
  const [backgroundColor, setBackgroundColor] = useState("");
  const [textColor, setTextColor] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mutation
  const createCue = useMutation(api.backgroundCues.create);

  // Handle create
  const handleCreate = useCallback(async () => {
    if (!selectedFile) {
      setError("Please select a background file");
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
      await createCue({
        bookPath,
        fileBasename: selectedFile,
        chapter,
        paragraph: paragraphNum,
        backgroundColor: backgroundColor.trim() || undefined,
        textColor: textColor.trim() || undefined,
      });

      toast.success(`Background cue added at Chapter ${chapter}, ¶${paragraphNum}`);
      onOpenChange(false);
      onCreated?.();

      // Reset form
      setSelectedFile(null);
      setParagraph("0");
      setBackgroundColor("");
      setTextColor("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create cue";
      setError(message);
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [
    bookPath,
    selectedFile,
    chapter,
    paragraph,
    backgroundColor,
    textColor,
    createCue,
    onOpenChange,
    onCreated,
  ]);

  // Handle close
  const handleClose = useCallback(() => {
    if (!isCreating) {
      onOpenChange(false);
      setSelectedFile(null);
      setParagraph("0");
      setBackgroundColor("");
      setTextColor("");
      setError(null);
    }
  }, [isCreating, onOpenChange]);

  // Get selected file details
  const selectedFileDetails = files?.find((f) => f.basename === selectedFile);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Add Background Cue
          </DialogTitle>
          <DialogDescription>
            Add a background to Chapter {chapter}. Select a file and set the paragraph where it
            should start.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Selection */}
          <div className="space-y-2">
            <Label>
              Background File <span className="text-destructive">*</span>
            </Label>
            {files && files.length > 0 ? (
              <ScrollArea className="h-48 border rounded-md">
                <div className="p-2 space-y-1">
                  {files.map((file) => {
                    const isImage = isImageFile(file.basename);
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
                        {/* Preview - priority: video preview > webp thumbnail > original */}
                        {file.previewMp4Url ? (
                          <video
                            className="h-10 w-16 object-cover rounded border"
                            autoPlay
                            loop
                            muted
                            playsInline
                            poster={file.previewWebpUrl}
                          >
                            <source src={file.previewMp4Url} type="video/mp4" />
                          </video>
                        ) : file.previewWebpUrl ? (
                          <img
                            src={file.previewWebpUrl}
                            alt={file.basename}
                            className="h-10 w-16 object-cover rounded border"
                          />
                        ) : file.url ? (
                          isImage ? (
                            <img
                              src={file.url}
                              alt={file.basename}
                              className="h-10 w-16 object-cover rounded border"
                            />
                          ) : (
                            <video
                              src={file.url}
                              className="h-10 w-16 object-cover rounded border"
                              muted
                              preload="metadata"
                            />
                          )
                        ) : (
                          <div className="h-10 w-16 bg-muted rounded border flex items-center justify-center">
                            {isImage ? (
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Video className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        )}
                        {/* Name */}
                        <span className="flex-1 text-sm truncate">{file.basename}</span>
                        {/* Selected indicator */}
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="h-24 border rounded-md flex items-center justify-center text-sm text-muted-foreground">
                No background files available. Upload some files first.
              </div>
            )}
          </div>

          {/* Paragraph */}
          <div className="space-y-2">
            <Label htmlFor="paragraph">
              Paragraph <span className="text-destructive">*</span>
            </Label>
            <Input
              id="paragraph"
              type="number"
              min="0"
              value={paragraph}
              onChange={(e) => setParagraph(e.target.value)}
              placeholder="0"
              disabled={isCreating}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">0 = start of chapter</p>
          </div>

          {/* Colors (optional) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="backgroundColor">Background Color</Label>
              <div className="flex gap-2">
                <Input
                  id="backgroundColor"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  placeholder="#1a1a1a"
                  disabled={isCreating}
                />
                {backgroundColor && (
                  <div
                    className="h-9 w-9 rounded border shrink-0"
                    style={{ backgroundColor: backgroundColor }}
                  />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="textColor">Text Color</Label>
              <div className="flex gap-2">
                <Input
                  id="textColor"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  placeholder="#f2e4c9"
                  disabled={isCreating}
                />
                {textColor && (
                  <div
                    className="h-9 w-9 rounded border shrink-0"
                    style={{ backgroundColor: textColor }}
                  />
                )}
              </div>
            </div>
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
