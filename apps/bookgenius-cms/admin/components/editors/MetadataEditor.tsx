"use client";

/**
 * MetadataEditor - Generic form for editing folder/asset metadata
 *
 * This component renders appropriate form fields based on the
 * entity type (book, character, chapter)
 *
 * It handles:
 * - Book metadata (books table)
 * - Character metadata (characterMetadata table)
 * - Chapter metadata (chapterMetadata table)
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { detectFolderType, parseBookPath, parseCharacterPath } from "@/lib/utils/folderPatterns";
import { parseChapterNumberFromBasename } from "@/lib/chapterUtils";
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
  {
    name: "backgroundStyle",
    label: "Background Style",
    type: "text",
    placeholder: "Moody, Bright, etc.",
  },
  {
    name: "periodStyle",
    label: "Period Style",
    type: "text",
    placeholder: "Victorian, Modern, etc.",
  },
  {
    name: "avatarStyle",
    label: "Avatar Style",
    type: "text",
    placeholder: "Illustrated, 3D, etc.",
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

// eslint-disable-next-line complexity
export function MetadataEditor({ folderPath, basename, onSaveComplete }: MetadataEditorProps) {
  const folderType = detectFolderType(folderPath);
  const isChapter =
    !!basename &&
    (folderPath.endsWith("/chapters") ||
      folderPath.endsWith("/chapters-source") ||
      folderPath.endsWith("/chapters-html"));

  const parsedBook = useMemo(() => parseBookPath(folderPath), [folderPath]);
  const parsedCharacter = useMemo(() => parseCharacterPath(folderPath), [folderPath]);
  const bookPath = parsedBook?.bookPath;
  const characterSlug = parsedCharacter?.characterSlug ?? folderPath.split("/").pop() ?? "";
  const chapterBasename = basename ?? "__none__";

  const { data: bookMetadata, isLoading: bookLoading } = useQuery({
    ...convexQuery(api.metadata.getBookMetadata, { bookPath: bookPath ?? "" }),
    enabled: folderType === "book" && !!bookPath,
  });

  const { data: characterMetadata, isLoading: characterLoading } = useQuery({
    ...convexQuery(api.metadata.getCharacterMetadata, { characterPath: folderPath }),
    enabled: folderType === "character",
  });

  const { data: chapterMetadata, isLoading: chapterLoading } = useQuery({
    ...convexQuery(api.metadata.getChapterMetadata, { folderPath, basename: chapterBasename }),
    enabled: isChapter,
  });

  // Form state
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Mutations
  const updateBookMetadata = useMutation(api.metadata.updateBookMetadata);
  const updateCharacterMetadata = useMutation(api.metadata.updateCharacterMetadata);
  const updateChapterMetadata = useMutation(api.metadata.updateChapterMetadata);

  // Detect entity type and get appropriate fields, including versionIds for asset types
  // eslint-disable-next-line complexity -- TODO: refactor to reduce complexity
  const { entityType, fields, currentData } = useMemo(() => {
    if (!bookPath) {
      return { entityType: null, fields: [], currentData: undefined };
    }

    if (isChapter) {
      const fallbackChapterNumber = basename ? parseChapterNumberFromBasename(basename) : undefined;
      return {
        entityType: "chapter" as const,
        fields: CHAPTER_FIELDS,
        currentData: {
          chapterNumber: chapterMetadata?.chapterNumber ?? fallbackChapterNumber ?? 0,
          title: chapterMetadata?.title ?? "",
        },
      };
    }

    if (folderType === "book") {
      return {
        entityType: "book" as const,
        fields: BOOK_FIELDS,
        currentData: {
          title: bookMetadata?.title ?? "",
          author: bookMetadata?.author ?? "",
          language: bookMetadata?.language ?? "",
          form: bookMetadata?.form ?? "",
          visualStyle: bookMetadata?.visualStyle ?? "",
          backgroundStyle: bookMetadata?.backgroundStyle ?? "",
          periodStyle: bookMetadata?.periodStyle ?? "",
          avatarStyle: bookMetadata?.avatarStyle ?? "",
        },
      };
    }

    if (folderType === "character") {
      return {
        entityType: "character" as const,
        fields: CHARACTER_FIELDS,
        currentData: {
          displayName: characterMetadata?.displayName ?? "",
          summary: characterMetadata?.summary ?? "",
          aiPrompt: characterMetadata?.aiPrompt ?? "",
        },
      };
    }

    return { entityType: null, fields: [], currentData: undefined };
  }, [bookPath, isChapter, basename, chapterMetadata, folderType, bookMetadata, characterMetadata]);

  useEffect(() => {
    setFormData({});
    setHasChanges(false);
  }, [folderPath, basename]);

  // Initialize form data from current metadata
  useEffect(() => {
    if (!currentData || Object.keys(formData).length > 0) return;
    const initial: Record<string, string | number> = {};
    const dataObj = currentData as Record<string, unknown>;
    for (const field of fields) {
      const value = dataObj[field.name];
      initial[field.name] = (value as string | number) ?? (field.type === "number" ? 0 : "");
    }
    setFormData(initial);
  }, [currentData, fields, formData]);

  // Handle field change
  const handleFieldChange = useCallback((name: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setHasChanges(true);
  }, []);

  // Handle reset
  const handleReset = useCallback(() => {
    if (currentData) {
      const initial: Record<string, string | number> = {};
      const dataObj = currentData as Record<string, unknown>;
      for (const field of fields) {
        const value = dataObj[field.name];
        initial[field.name] = (value as string | number) ?? (field.type === "number" ? 0 : "");
      }
      setFormData(initial);
      setHasChanges(false);
    }
  }, [currentData, fields]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!entityType) return;

    setIsSaving(true);

    try {
      // Build metadata payload, converting number fields from strings
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

      if (!bookPath) {
        toast.error("Book path not found");
        return;
      }

      if (entityType === "book") {
        await updateBookMetadata({ bookPath, ...processedData });
        toast.success("Metadata saved");
      } else if (entityType === "character") {
        await updateCharacterMetadata({
          bookPath,
          characterSlug,
          displayName: processedData.displayName as string,
          summary: processedData.summary as string,
          aiPrompt: processedData.aiPrompt as string | undefined,
        });
        toast.success("Metadata saved");
      } else if (entityType === "chapter" && basename) {
        const chapterNumber = processedData.chapterNumber as number;
        if (!chapterNumber) {
          toast.error("Chapter number is required");
          return;
        }
        await updateChapterMetadata({
          bookPath,
          folderPath,
          basename,
          chapterNumber,
          title: processedData.title as string,
        });
        toast.success("Metadata saved");
      } else {
        toast.error("Unsupported metadata type");
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
    bookPath,
    characterSlug,
    updateBookMetadata,
    updateCharacterMetadata,
    updateChapterMetadata,
    onSaveComplete,
  ]);
  // Loading state
  const isLoading =
    (entityType === "book" && bookLoading) ||
    (entityType === "character" && characterLoading) ||
    (entityType === "chapter" && chapterLoading);

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
