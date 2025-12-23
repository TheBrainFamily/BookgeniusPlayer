"use client";

/**
 * ChapterEditor - XML chapter editor with character autocomplete
 *
 * This component:
 * 1. Fetches the XML content using a Convex action (bypasses CORS)
 * 2. Displays it in Monaco with character tag autocomplete
 * 3. Auto-saves drafts as you type (debounced)
 * 4. Cmd+S saves and publishes in one step
 *
 * The character autocomplete suggests tags like:
 * - <WinstonSmith talking="true"/>
 * - <Julia talking="false"/>
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  /** Whether the editor is read-only (e.g., for archived versions) */
  readOnly?: boolean;
  /** Called when a save/publish is completed */
  onSaveComplete?: () => void;
}

// =============================================================================
// Content Fetching Hook (uses Convex action to bypass CORS)
// =============================================================================

function useXmlContent(versionId: string) {
  const [content, setContent] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use the wrapper action from cli.ts (bypasses CORS by fetching server-side)
  const getTextContent = useAction(api.cli.getTextContent);

  useEffect(() => {
    let cancelled = false;
    console.log("[useXmlContent] Effect triggered, fetching for versionId:", versionId);

    async function fetchContent() {
      setError(null);

      try {
        console.log("[useXmlContent] Calling getTextContent...");
        const result = await getTextContent({ versionId });
        if (!result) {
          throw new Error("Content not found");
        }
        if (!cancelled) {
          console.log("[useXmlContent] Got content", { contentLength: result.content?.length, prevContentLength: content?.length, contentChanged: content !== result.content });
          // Only update content if it actually changed (prevents cursor jump)
          setContent((prev) => {
            const changed = prev !== result.content;
            console.log("[useXmlContent] setContent called", { changed, prevLength: prev?.length, newLength: result.content?.length });
            return changed ? result.content : prev;
          });
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[useXmlContent] Error fetching content:", e);
          setError(e instanceof Error ? e.message : "Failed to load content");
        }
      } finally {
        if (!cancelled) {
          setIsInitialLoad(false);
        }
      }
    }

    fetchContent();

    return () => {
      cancelled = true;
    };
  }, [versionId, getTextContent]);

  // Only show loading on initial load when we have no content yet
  const isLoading = isInitialLoad && content === null;

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

  // Track the last auto-saved content to avoid redundant saves
  const lastAutoSavedContentRef = useRef<string | null>(null);

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

  // Helper: Upload content and create a draft
  const uploadDraft = useCallback(
    async (xmlContent: string) => {
      const { intentId, backend, uploadUrl } = await startUpload({
        folderPath,
        basename,
        publish: false, // Save as draft
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
    },
    [folderPath, basename, startUpload, finishUpload, currentVersionExtra],
  );

  // Auto-save handler (silent, no toast, debounced by XmlEditor)
  const handleAutoSave = useCallback(
    async (xmlContent: string) => {
      console.log("[ChapterEditor] handleAutoSave called", {
        contentLength: xmlContent?.length,
        lastAutoSavedLength: lastAutoSavedContentRef.current?.length,
        isSameContent: xmlContent === lastAutoSavedContentRef.current,
      });

      // Skip if content hasn't changed since last auto-save
      if (xmlContent === lastAutoSavedContentRef.current) {
        console.log("[ChapterEditor] handleAutoSave skipped - same content");
        return;
      }

      try {
        console.log("[ChapterEditor] Uploading draft...");
        await uploadDraft(xmlContent);
        lastAutoSavedContentRef.current = xmlContent;
        console.log("[ChapterEditor] Draft uploaded, lastAutoSavedContentRef updated");
      } catch (e) {
        console.error("[ChapterEditor] Auto-save failed:", e);
      }
    },
    [uploadDraft],
  );

  // Manual save handler (Cmd+S) - saves and publishes in one step
  const handleSave = useCallback(
    async (xmlContent: string) => {
      console.log("[ChapterEditor] handleSave called (Cmd+S)", {
        contentLength: xmlContent?.length,
        lastAutoSavedLength: lastAutoSavedContentRef.current?.length,
        needsUpload: xmlContent !== lastAutoSavedContentRef.current,
      });

      setIsSaving(true);

      try {
        // If content changed since last auto-save, save it first
        if (xmlContent !== lastAutoSavedContentRef.current) {
          console.log("[ChapterEditor] Content differs from last auto-save, uploading...");
          await uploadDraft(xmlContent);
          lastAutoSavedContentRef.current = xmlContent;
        } else {
          console.log("[ChapterEditor] Content same as last auto-save, skipping upload");
        }

        // Publish the draft
        console.log("[ChapterEditor] Publishing draft...", { folderPath, basename });
        await publishDraft({ folderPath, basename });
        console.log("[ChapterEditor] Draft published!");

        toast.success("Chapter published");
        onSaveComplete?.();
      } catch (e) {
        console.error("[ChapterEditor] Save failed:", e);
        toast.error(e instanceof Error ? e.message : "Failed to publish chapter");
      } finally {
        setIsSaving(false);
      }
    },
    [folderPath, basename, uploadDraft, publishDraft, onSaveComplete],
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
        <XmlEditor value={content} onAutoSave={handleAutoSave} onSave={handleSave} completionProvider={completionProvider} readOnly={readOnly} isSaving={isSaving} />
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
  const lastAutoSavedContentRef = useRef<string | null>(null);

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
  const publishDraft = useMutation(api.cli.publishDraft);

  const uploadDraft = useCallback(
    async (xmlContent: string) => {
      const { intentId, backend, uploadUrl } = await startUpload({
        folderPath: props.folderPath,
        basename: props.basename,
        publish: false,
        label: `Edited chapter`,
        extra: currentVersionExtra,
      });

      const contentType = "application/xml";
      const blob = new Blob([xmlContent], { type: contentType });

      const response = await fetch(uploadUrl, { method: backend === "r2" ? "PUT" : "POST", headers: { "Content-Type": contentType }, body: blob });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const uploadResponse = backend === "convex" ? await response.json() : undefined;
      await finishUpload({ intentId, uploadResponse, size: blob.size, contentType });
    },
    [props.folderPath, props.basename, startUpload, finishUpload, currentVersionExtra],
  );

  const handleAutoSave = useCallback(
    async (xmlContent: string) => {
      if (xmlContent === lastAutoSavedContentRef.current) return;
      try {
        await uploadDraft(xmlContent);
        lastAutoSavedContentRef.current = xmlContent;
      } catch (e) {
        console.error("Auto-save failed:", e);
      }
    },
    [uploadDraft],
  );

  const handleSave = useCallback(
    async (xmlContent: string) => {
      setIsSaving(true);
      try {
        if (xmlContent !== lastAutoSavedContentRef.current) {
          await uploadDraft(xmlContent);
          lastAutoSavedContentRef.current = xmlContent;
        }
        await publishDraft({ folderPath: props.folderPath, basename: props.basename });
        toast.success("Chapter published");
        props.onSaveComplete?.();
      } catch (e) {
        console.error("Save failed:", e);
        toast.error(e instanceof Error ? e.message : "Failed to publish chapter");
      } finally {
        setIsSaving(false);
      }
    },
    [props.folderPath, props.basename, uploadDraft, publishDraft, props.onSaveComplete],
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

  return <XmlEditor value={content} onAutoSave={handleAutoSave} onSave={handleSave} readOnly={props.readOnly} isSaving={isSaving} />;
}
