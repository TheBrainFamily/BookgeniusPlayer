"use client";

/**
 * ChapterEditor - XML chapter editor with character autocomplete
 *
 * This component:
 * 1. Fetches the XML content using a Convex action (bypasses CORS)
 * 2. Displays it in Monaco with character tag autocomplete
 * 3. Saves changes as new draft versions
 *
 * The character autocomplete suggests tags like:
 * - <WinstonSmith talking="true"/>
 * - <Julia talking="false"/>
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useMutation, useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@convex/_generated/api";
import { queries } from "@/lib/queries";
import { XmlEditor } from "./XmlEditor";
import { useCharacters } from "../../../lib/contexts/BookContext";
import type { editor, languages, Position } from "monaco-editor";
import { Loader2, FileWarning, BookOpen } from "lucide-react";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface CharacterInfo {
  path: string;
  slug: string;
  name: string;
}

interface ChapterEditorProps {
  /** Folder path where the chapter asset lives */
  folderPath: string;
  /** Basename of the chapter file (e.g., "chapter1.xml") */
  basename: string;
  /** Version ID to fetch content from (uses Convex action to bypass CORS) */
  versionId: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Called when a save is completed */
  onSaveComplete?: () => void;
}

// =============================================================================
// Content Fetching Hook (uses Convex action to bypass CORS)
// =============================================================================

function useXmlContent(versionId: string) {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use the wrapper action from cli.ts (bypasses CORS by fetching server-side)
  const getTextContent = useAction(api.cli.getTextContent);

  useEffect(() => {
    let cancelled = false;

    async function fetchContent() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getTextContent({ versionId });
        if (!result) {
          throw new Error("Content not found");
        }
        if (!cancelled) {
          setContent(result.content);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load content");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchContent();

    return () => {
      cancelled = true;
    };
  }, [versionId, getTextContent]);

  return { content, isLoading, error };
}

// =============================================================================
// Character Autocomplete Provider
// =============================================================================

function createCharacterCompletionProvider(characters: CharacterInfo[]) {
  return (monaco: typeof import("monaco-editor"), model: editor.ITextModel, position: Position): languages.CompletionItem[] => {
    const lineContent = model.getLineContent(position.lineNumber);
    const textBeforeCursor = lineContent.substring(0, position.column - 1);

    // Check if we're starting a tag (after <)
    const isStartingTag = textBeforeCursor.endsWith("<");
    // Check if we're in a tag and typing an attribute
    const isInAttribute = /<\w+\s+[^>]*$/.test(textBeforeCursor);

    if (isStartingTag) {
      // Suggest character tags
      return characters.map((char) => {
        // Convert slug to PascalCase for tag name
        const tagName = char.slug
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("");

        return {
          label: tagName,
          kind: monaco.languages.CompletionItemKind.Class,
          detail: `Character: ${char.name}`,
          insertText: `${tagName} talking="true"/>`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column },
        };
      });
    }

    if (isInAttribute) {
      // Suggest talking attribute values
      const talkingMatch = textBeforeCursor.match(/talking="$/);
      if (talkingMatch) {
        return [
          {
            label: "true",
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: "true",
            detail: "Character is speaking",
            range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column },
          },
          {
            label: "false",
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: "false",
            detail: "Character is listening",
            range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column },
          },
        ];
      }
    }

    return [];
  };
}

// =============================================================================
// Component
// =============================================================================

export function ChapterEditor({ folderPath, basename, versionId, readOnly = false, onSaveComplete }: ChapterEditorProps) {
  const { content, isLoading, error } = useXmlContent(versionId);
  const { characters: rawCharacters, isLoading: charactersLoading } = useCharacters();

  const [isSaving, setIsSaving] = useState(false);

  // Fetch versions to get the current version's extra metadata
  const { data: versions } = useQuery(queries.assetVersions(folderPath, basename));

  // Get the current version's extra metadata to preserve when saving
  const currentVersionExtra = useMemo(() => {
    if (!versions) return undefined;
    const currentVersion = versions.find((v: { _id: string }) => v._id === versionId);
    return currentVersion?.extra;
  }, [versions, versionId]);

  // Convex mutations for saving
  const startUpload = useMutation(api.generateUploadUrl.startUpload);
  const finishUpload = useMutation(api.generateUploadUrl.finishUpload);
  const publishDraft = useMutation(api.cli.publishDraft);

  // Transform characters for autocomplete
  const characters = useMemo<CharacterInfo[]>(() => {
    if (!rawCharacters) return [];
    return rawCharacters.map((c) => ({ path: c.path, slug: c.slug, name: c.name }));
  }, [rawCharacters]);

  // Create completion provider with characters
  const completionProvider = useMemo(() => {
    if (characters.length === 0) return undefined;
    return createCharacterCompletionProvider(characters);
  }, [characters]);

  // Handle save
  const handleSave = useCallback(
    async (xmlContent: string) => {
      setIsSaving(true);

      try {
        // 1. Start upload - IMPORTANT: preserve extra metadata from current version
        const { intentId, backend, uploadUrl } = await startUpload({
          folderPath,
          basename,
          publish: false, // Save as draft first
          label: `Edited chapter`,
          extra: currentVersionExtra, // Preserve chapterNumber, title, etc.
        });

        // 2. Upload content
        const contentType = "application/xml";
        const blob = new Blob([xmlContent], { type: contentType });

        const response = await fetch(uploadUrl, { method: backend === "r2" ? "PUT" : "POST", headers: { "Content-Type": contentType }, body: blob });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }

        // 3. Finish upload
        const uploadResponse = backend === "convex" ? await response.json() : undefined;

        await finishUpload({ intentId, uploadResponse, size: blob.size, contentType });

        toast.success("Chapter saved as draft");
        onSaveComplete?.();
      } catch (e) {
        console.error("Save failed:", e);
        toast.error(e instanceof Error ? e.message : "Failed to save chapter");
      } finally {
        setIsSaving(false);
      }
    },
    [folderPath, basename, startUpload, finishUpload, onSaveComplete, currentVersionExtra],
  );

  // Loading state
  if (isLoading || charactersLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading chapter content...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <FileWarning className="h-12 w-12 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  // No content
  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <BookOpen className="h-12 w-12" />
        <p className="text-sm">No content to display</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Character count indicator */}
      {characters.length > 0 && (
        <div className="px-3 py-1 border-b border-border bg-surface-1 text-xs text-muted-foreground">
          {characters.length} characters available for autocomplete (type <code className="bg-muted px-1 rounded">&lt;</code> to see suggestions)
        </div>
      )}

      {/* Editor */}
      <div className="flex-1">
        <XmlEditor value={content} onSave={handleSave} completionProvider={completionProvider} readOnly={readOnly} isSaving={isSaving} />
      </div>
    </div>
  );
}

// =============================================================================
// Wrapper for use outside BookProvider
// =============================================================================

/**
 * Standalone ChapterEditor that works without BookProvider.
 * Use when you need to edit a chapter but don't have book context.
 * (No character autocomplete, but can still edit XML)
 */
export function StandaloneChapterEditor(props: ChapterEditorProps) {
  const { content, isLoading, error } = useXmlContent(props.versionId);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch versions to get the current version's extra metadata
  const { data: versions } = useQuery(queries.assetVersions(props.folderPath, props.basename));

  // Get the current version's extra metadata to preserve when saving
  const currentVersionExtra = useMemo(() => {
    if (!versions) return undefined;
    const currentVersion = versions.find((v: { _id: string }) => v._id === props.versionId);
    return currentVersion?.extra;
  }, [versions, props.versionId]);

  const startUpload = useMutation(api.generateUploadUrl.startUpload);
  const finishUpload = useMutation(api.generateUploadUrl.finishUpload);

  const handleSave = useCallback(
    async (xmlContent: string) => {
      setIsSaving(true);

      try {
        const { intentId, backend, uploadUrl } = await startUpload({
          folderPath: props.folderPath,
          basename: props.basename,
          publish: false,
          label: `Edited chapter`,
          extra: currentVersionExtra, // Preserve chapterNumber, title, etc.
        });

        const contentType = "application/xml";
        const blob = new Blob([xmlContent], { type: contentType });

        const response = await fetch(uploadUrl, { method: backend === "r2" ? "PUT" : "POST", headers: { "Content-Type": contentType }, body: blob });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }

        const uploadResponse = backend === "convex" ? await response.json() : undefined;

        await finishUpload({ intentId, uploadResponse, size: blob.size, contentType });

        toast.success("Chapter saved as draft");
        props.onSaveComplete?.();
      } catch (e) {
        console.error("Save failed:", e);
        toast.error(e instanceof Error ? e.message : "Failed to save chapter");
      } finally {
        setIsSaving(false);
      }
    },
    [props.folderPath, props.basename, startUpload, finishUpload, props.onSaveComplete, currentVersionExtra],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">{error || "No content"}</p>
      </div>
    );
  }

  return <XmlEditor value={content} onSave={handleSave} readOnly={props.readOnly} isSaving={isSaving} />;
}
