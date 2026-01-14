"use client";

/**
 * CreateCharacterDialog - Dialog for creating new characters
 *
 * Creates a character folder with metadata and placeholder assets.
 */

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
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
import { Textarea } from "../../../components/ui/textarea";
import { Loader2, User, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface CreateCharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The book path (e.g., "books/1984-English") */
  bookPath: string;
  /** Called after successful creation with the new character path */
  onCreated?: (characterPath: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function CreateCharacterDialog({
  open,
  onOpenChange,
  bookPath,
  onCreated,
}: CreateCharacterDialogProps) {
  // Form state
  const [displayName, setDisplayName] = useState("");
  const [summary, setSummary] = useState("");
  const [slug, setSlug] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mutations
  const createFolder = useMutation(api.cli.createFolderByPath);
  const updateCharacterMetadata = useMutation(api.metadata.updateCharacterMetadata);

  // Generate slug from display name
  const generateSlug = useCallback((name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }, []);

  // Handle display name change
  const handleDisplayNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newName = e.target.value;
      setDisplayName(newName);
      // Auto-generate slug if user hasn't manually edited it
      if (!slug || slug === generateSlug(displayName)) {
        setSlug(generateSlug(newName));
      }
    },
    [displayName, slug, generateSlug],
  );

  // Handle create
  const handleCreate = useCallback(async () => {
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }
    if (!slug.trim()) {
      setError("Slug is required");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const characterPath = `${bookPath}/characters/${slug}`;

      // Create character folder
      await createFolder({ path: characterPath });
      await updateCharacterMetadata({
        bookPath,
        characterSlug: slug,
        displayName: displayName.trim(),
        summary: summary.trim(),
      });

      toast.success(`Character "${displayName}" created`);
      onOpenChange(false);
      onCreated?.(characterPath);

      // Reset form
      setDisplayName("");
      setSummary("");
      setSlug("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create character";
      setError(message);
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [
    bookPath,
    displayName,
    summary,
    slug,
    createFolder,
    updateCharacterMetadata,
    onOpenChange,
    onCreated,
  ]);

  // Handle close
  const handleClose = useCallback(() => {
    if (!isCreating) {
      onOpenChange(false);
      setDisplayName("");
      setSummary("");
      setSlug("");
      setError(null);
    }
  }, [isCreating, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Create Character
          </DialogTitle>
          <DialogDescription>
            Add a new character to this book. You can upload their avatar, speaks, and listens
            assets after creating.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">
              Display Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={handleDisplayNameChange}
              placeholder="Winston Smith"
              disabled={isCreating}
            />
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">
              Slug <span className="text-destructive">*</span>
            </Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="winston-smith"
              disabled={isCreating}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Used in folder path: {bookPath}/characters/
              <span className="text-foreground">{slug || "..."}</span>
            </p>
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSummary(e.target.value)}
              placeholder="A brief description of this character..."
              disabled={isCreating}
              className="min-h-[80px]"
            />
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
          <Button onClick={handleCreate} disabled={isCreating || !displayName.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Character"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
