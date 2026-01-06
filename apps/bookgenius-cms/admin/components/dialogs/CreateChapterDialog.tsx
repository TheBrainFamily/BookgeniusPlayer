"use client";

/**
 * CreateChapterDialog - Dialog for creating new chapters
 *
 * Creates a chapter XML file with initial template and metadata.
 */

import { useState, useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useBook } from "@/lib/contexts";
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
import { Loader2, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface CreateChapterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The book path (e.g., "books/1984-English") */
  bookPath: string;
  /** Called after successful creation */
  onCreated?: (folderPath: string, basename: string) => void;
}

// =============================================================================
// Template Generation
// =============================================================================

function generateChapterTemplate(chapterNumber: number, title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<chapter number="${chapterNumber}">
  <h3>Chapter ${chapterNumber}</h3>
  <h4>${title}</h4>

  <p>
    Begin writing your chapter content here...
  </p>
</chapter>
`;
}

// =============================================================================
// Component
// =============================================================================

export function CreateChapterDialog({
  open,
  onOpenChange,
  bookPath,
  onCreated,
}: CreateChapterDialogProps) {
  // Form state
  const [chapterNumber, setChapterNumber] = useState("");
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mutations
  const startUpload = useMutation(api.generateUploadUrl.startUpload);
  const finishUpload = useMutation(api.generateUploadUrl.finishUpload);

  // Generate filename from chapter number
  const filename = useMemo(() => {
    const num = parseInt(chapterNumber);
    if (isNaN(num) || num < 1) return "";
    return `chapter${num}.xml`;
  }, [chapterNumber]);

  // Folder path for chapters
  const chaptersPath = `${bookPath}/chapters`;

  // Handle create
  const handleCreate = useCallback(async () => {
    const num = parseInt(chapterNumber);
    if (isNaN(num) || num < 1) {
      setError("Please enter a valid chapter number");
      return;
    }
    if (!title.trim()) {
      setError("Please enter a chapter title");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Generate XML content
      const xmlContent = generateChapterTemplate(num, title.trim());
      const contentType = "application/xml";
      const blob = new Blob([xmlContent], { type: contentType });

      // Start upload
      const { intentId, backend, uploadUrl } = await startUpload({
        folderPath: chaptersPath,
        basename: filename,
        publish: true, // Publish immediately
        extra: { type: "chapter", chapterNumber: num, title: title.trim() },
      });

      // Upload content
      const response = await fetch(uploadUrl, {
        method: backend === "r2" ? "PUT" : "POST",
        headers: { "Content-Type": contentType },
        body: blob,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      // Finish upload
      const uploadResponse = backend === "convex" ? await response.json() : undefined;
      await finishUpload({ intentId, uploadResponse, size: blob.size, contentType });

      toast.success(`Chapter ${num} created`);
      onOpenChange(false);
      onCreated?.(chaptersPath, filename);

      // Reset form
      setChapterNumber("");
      setTitle("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create chapter";
      setError(message);
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [
    bookPath,
    chaptersPath,
    chapterNumber,
    title,
    filename,
    startUpload,
    finishUpload,
    onOpenChange,
    onCreated,
  ]);

  // Handle close
  const handleClose = useCallback(() => {
    if (!isCreating) {
      onOpenChange(false);
      setChapterNumber("");
      setTitle("");
      setError(null);
    }
  }, [isCreating, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Create Chapter
          </DialogTitle>
          <DialogDescription>
            Add a new chapter to this book. A template XML file will be created that you can edit in
            the chapter editor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Chapter Number */}
          <div className="space-y-2">
            <Label htmlFor="chapterNumber">
              Chapter Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="chapterNumber"
              type="number"
              min="1"
              value={chapterNumber}
              onChange={(e) => setChapterNumber(e.target.value)}
              placeholder="1"
              disabled={isCreating}
            />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The Beginning"
              disabled={isCreating}
            />
          </div>

          {/* File preview */}
          {filename && (
            <div className="text-sm text-muted-foreground">
              Will create: <code className="bg-muted px-1 rounded">{filename}</code>
            </div>
          )}

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
          <Button onClick={handleCreate} disabled={isCreating || !chapterNumber || !title.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Chapter"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Wrapper with BookProvider context
// =============================================================================

interface CreateChapterDialogWithContextProps extends CreateChapterDialogProps {}

export function CreateChapterDialogWithContext(props: CreateChapterDialogWithContextProps) {
  // This version can access book context for additional features
  // like suggesting next chapter number
  return <CreateChapterDialog {...props} />;
}
