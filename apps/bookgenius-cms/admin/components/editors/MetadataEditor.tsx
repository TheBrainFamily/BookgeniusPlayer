"use client";

/**
 * MetadataEditor - Generic form for editing folder/asset metadata
 *
 * This component renders appropriate form fields based on the
 * entity type (book, character, background, music, etc.)
 *
 * It handles:
 * - Folder extra fields (book, character)
 * - Asset version extra fields (chapter, background, music)
 */

import { useState, useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@convex/_generated/api";
import { queries } from "@/lib/queries";
import {
  type BookFolderExtra,
  type CharacterFolderExtra,
  type ChapterExtra,
  type BackgroundExtra,
  type MusicExtra,
  isBookFolder,
  isCharacterFolder,
} from "@/lib/types/book";
import { detectFolderType, type DetectedFolderType } from "@/lib/utils/folderPatterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save, RotateCcw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface MetadataEditorProps {
  /** Folder path */
  folderPath: string;
  /** Optional basename for asset metadata (if editing asset version) */
  basename?: string;
  /** Called when save completes */
  onSaveComplete?: () => void;
}

// Form field definitions
interface FormField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "color";
  placeholder?: string;
  required?: boolean;
}

// =============================================================================
// Form Field Definitions by Type
// =============================================================================

const BOOK_FIELDS: FormField[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "author", label: "Author", type: "text", required: true },
  { name: "language", label: "Language", type: "text", placeholder: "English" },
  { name: "form", label: "Form", type: "text", placeholder: "Novel, Short Story, etc." },
  {
    name: "visualStyle",
    label: "Visual Style",
    type: "text",
    placeholder: "Realistic, Cartoon, etc.",
  },
];

const CHARACTER_FIELDS: FormField[] = [
  { name: "displayName", label: "Display Name", type: "text", required: true },
  { name: "summary", label: "Summary", type: "textarea", required: true },
  {
    name: "aiPrompt",
    label: "AI Prompt",
    type: "textarea",
    placeholder: "Instructions for AI generation...",
  },
];

const CHAPTER_FIELDS: FormField[] = [
  { name: "chapterNumber", label: "Chapter Number", type: "number", required: true },
  { name: "title", label: "Title", type: "text", required: true },
];

const BACKGROUND_FIELDS: FormField[] = [
  { name: "chapter", label: "Chapter", type: "number", required: true },
  { name: "paragraph", label: "Paragraph", type: "number", required: true },
  { name: "backgroundColor", label: "Background Color", type: "color", required: true },
  { name: "textColor", label: "Text Color", type: "color", required: true },
];

const MUSIC_FIELDS: FormField[] = [
  { name: "chapter", label: "Chapter", type: "number", required: true },
  { name: "paragraph", label: "Paragraph", type: "number", required: true },
];

// =============================================================================
// Field Renderer
// =============================================================================

interface FieldRendererProps {
  field: FormField;
  value: string | number;
  onChange: (name: string, value: string | number) => void;
  disabled?: boolean;
}

function FieldRenderer({ field, value, onChange, disabled }: FieldRendererProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // For number fields, store as string during editing to allow proper typing
      // Conversion to number happens on save
      onChange(field.name, e.target.value);
    },
    [field.name, onChange],
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={field.name} className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {field.type === "textarea" ? (
        <Textarea
          id={field.name}
          value={String(value)}
          onChange={handleChange}
          placeholder={field.placeholder}
          disabled={disabled}
          className="min-h-[80px]"
        />
      ) : field.type === "color" ? (
        <div className="flex items-center gap-2">
          <Input
            id={field.name}
            type="color"
            value={String(value)}
            onChange={handleChange}
            disabled={disabled}
            className="w-12 h-10 p-1 cursor-pointer"
          />
          <Input
            type="text"
            value={String(value)}
            onChange={handleChange}
            placeholder="#000000"
            disabled={disabled}
            className="flex-1 font-mono"
          />
        </div>
      ) : (
        <Input
          id={field.name}
          type={field.type === "number" ? "text" : field.type}
          inputMode={field.type === "number" ? "numeric" : undefined}
          pattern={field.type === "number" ? "[0-9]*" : undefined}
          value={String(value)}
          onChange={handleChange}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function MetadataEditor({ folderPath, basename, onSaveComplete }: MetadataEditorProps) {
  // Get folder data
  const { data: folder, isLoading: folderLoading } = useQuery({
    ...queries.folders(folderPath.split("/").slice(0, -1).join("/") || ""),
    select: (folders) => folders?.find((f) => f.path === folderPath),
  });

  // Get asset data if editing asset metadata
  const { data: asset, isLoading: assetLoading } = useQuery({
    ...queries.asset(folderPath, basename || ""),
    enabled: !!basename,
  });

  // Get asset versions for version extra
  const { data: versions, isLoading: versionsLoading } = useQuery({
    ...queries.assetVersions(folderPath, basename || ""),
    enabled: !!basename,
  });

  // Form state
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Mutations
  const updateFolder = useMutation(api.cli.updateFolder);
  const updateVersionExtra = useMutation(api.cli.updateVersionExtra);

  // Detect entity type and get appropriate fields, including versionIds for asset types
  const { entityType, fields, currentExtra, publishedVersionId, draftVersionId } = useMemo(() => {
    const folderType = detectFolderType(folderPath, folder?.extra);

    // If editing an asset version, check its extra OR infer from folder path
    if (basename && versions?.length) {
      const publishedVersion = versions.find((v: { state: string }) => v.state === "published");
      const draftVersion = versions.find((v: { state: string }) => v.state === "draft");

      // IMPORTANT: Always show PUBLISHED version's extra to match what's displayed in lists
      const sourceVersion = publishedVersion || draftVersion;
      const extra = sourceVersion?.extra;

      // Check extra.type first, then fall back to folder path pattern
      const isChapter = extra?.type === "chapter" || folderPath.endsWith("/chapters");
      const isBackground = extra?.type === "background" || folderPath.endsWith("/backgrounds");
      const isMusic = extra?.type === "music" || folderPath.endsWith("/music");

      if (isChapter) {
        return {
          entityType: "chapter" as const,
          fields: CHAPTER_FIELDS,
          currentExtra: (extra as ChapterExtra) || { type: "chapter", chapterNumber: 0, title: "" },
          publishedVersionId: publishedVersion?._id,
          draftVersionId: draftVersion?._id,
        };
      }
      if (isBackground) {
        return {
          entityType: "background" as const,
          fields: BACKGROUND_FIELDS,
          currentExtra: (extra as BackgroundExtra) || {
            type: "background",
            chapter: 0,
            paragraph: 0,
            backgroundColor: "#000000",
            textColor: "#ffffff",
          },
          publishedVersionId: publishedVersion?._id,
          draftVersionId: draftVersion?._id,
        };
      }
      if (isMusic) {
        return {
          entityType: "music" as const,
          fields: MUSIC_FIELDS,
          currentExtra: (extra as MusicExtra) || { type: "music", chapter: 0, paragraph: 0 },
          publishedVersionId: publishedVersion?._id,
          draftVersionId: draftVersion?._id,
        };
      }
    }

    // Check folder type
    if (folderType === "book" || isBookFolder(folder?.extra)) {
      return {
        entityType: "book" as const,
        fields: BOOK_FIELDS,
        currentExtra: folder?.extra as BookFolderExtra | undefined,
        publishedVersionId: undefined,
        draftVersionId: undefined,
      };
    }
    if (folderType === "character" || isCharacterFolder(folder?.extra)) {
      return {
        entityType: "character" as const,
        fields: CHARACTER_FIELDS,
        currentExtra: folder?.extra as CharacterFolderExtra | undefined,
        publishedVersionId: undefined,
        draftVersionId: undefined,
      };
    }

    return {
      entityType: null,
      fields: [],
      currentExtra: undefined,
      publishedVersionId: undefined,
      draftVersionId: undefined,
    };
  }, [folderPath, folder?.extra, basename, versions]);

  // Initialize form data from current extra
  useMemo(() => {
    if (currentExtra && Object.keys(formData).length === 0) {
      const initial: Record<string, string | number> = {};
      const extraObj = currentExtra as unknown as Record<string, unknown>;
      for (const field of fields) {
        const value = extraObj[field.name];
        initial[field.name] = (value as string | number) ?? (field.type === "number" ? 0 : "");
      }
      setFormData(initial);
    }
  }, [currentExtra, fields, formData]);

  // Handle field change
  const handleFieldChange = useCallback((name: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setHasChanges(true);
  }, []);

  // Handle reset
  const handleReset = useCallback(() => {
    if (currentExtra) {
      const initial: Record<string, string | number> = {};
      const extraObj = currentExtra as unknown as Record<string, unknown>;
      for (const field of fields) {
        const value = extraObj[field.name];
        initial[field.name] = (value as string | number) ?? (field.type === "number" ? 0 : "");
      }
      setFormData(initial);
      setHasChanges(false);
    }
  }, [currentExtra, fields]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!entityType) return;

    setIsSaving(true);

    try {
      // Build new extra object, converting number fields from strings
      const processedData: Record<string, string | number> = {};
      for (const field of fields) {
        const value = formData[field.name];
        if (field.type === "number") {
          // Convert to number, default to 0 if empty or invalid
          processedData[field.name] =
            value === "" || value === undefined ? 0 : parseInt(String(value), 10) || 0;
        } else {
          processedData[field.name] = value ?? "";
        }
      }

      const newExtra = { type: entityType, ...processedData };

      // For folder types (book, character), update the folder
      if (entityType === "book" || entityType === "character") {
        await updateFolder({ path: folderPath, extra: newExtra });
        toast.success("Metadata saved");
      }
      // For asset version types (chapter, background, music), update BOTH versions for consistency
      else if (publishedVersionId || draftVersionId) {
        // Update published version (so changes are immediately visible in lists)
        if (publishedVersionId) {
          await updateVersionExtra({ versionId: publishedVersionId, extra: newExtra });
        }
        // Also update draft version (so changes are preserved when publishing)
        if (draftVersionId) {
          await updateVersionExtra({ versionId: draftVersionId, extra: newExtra });
        }
        toast.success("Metadata saved");
      } else {
        toast.error("No version found to update");
        return;
      }

      setHasChanges(false);
      onSaveComplete?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [
    entityType,
    fields,
    formData,
    folderPath,
    updateFolder,
    updateVersionExtra,
    publishedVersionId,
    draftVersionId,
    onSaveComplete,
  ]);

  // Loading state
  const isLoading = folderLoading || (basename && (assetLoading || versionsLoading));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Unknown entity type
  if (!entityType || fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">No editable metadata for this item</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Metadata</h2>
          <Badge variant="muted" className="text-xs capitalize">
            {entityType}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={isSaving}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Form */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {fields.map((field) => (
            <FieldRenderer
              key={field.name}
              field={field}
              value={formData[field.name] ?? (field.type === "number" ? 0 : "")}
              onChange={handleFieldChange}
              disabled={isSaving}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
