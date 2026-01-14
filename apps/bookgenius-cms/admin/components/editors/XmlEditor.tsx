"use client";

/**
 * XmlEditor - Monaco editor wrapper for XML files
 *
 * Controlled editor that syncs with value prop, but preserves cursor
 * when the new value matches what's already in the editor.
 */

import { useRef, useCallback, useEffect, useState } from "react";
import Editor, { type OnMount, type OnChange } from "@monaco-editor/react";
import type { editor, IDisposable, Position } from "monaco-editor";
import { Loader2, AlertCircle, Cloud, CloudOff } from "lucide-react";
import { logError } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface XmlEditorProps {
  /** XML content to display */
  value: string;
  /** Called for auto-saving (debounced, fires automatically on changes) */
  onAutoSave?: (value: string) => Promise<void>;
  /** Called when manual save is triggered (Ctrl+S) */
  onSave?: (value: string) => Promise<void>;
  /** Custom completion items provider */
  completionProvider?: (
    monaco: typeof import("monaco-editor"),
    model: editor.ITextModel,
    position: import("monaco-editor").Position,
  ) => import("monaco-editor").languages.CompletionItem[];
  /** Whether the editor is in read-only mode */
  readOnly?: boolean;
  /** External saving state (for manual save) */
  isSaving?: boolean;
  /** Height of the editor (default: 100%) */
  height?: string;
  /** Minimum height */
  minHeight?: string;
  /** Auto-save debounce delay in ms (default: 1500) */
  autoSaveDelay?: number;
}

// =============================================================================
// Component
// =============================================================================

export function XmlEditor({
  value,
  onAutoSave,
  onSave,
  completionProvider,
  readOnly = false,
  isSaving = false,
  height = "100%",
  minHeight = "400px",
  autoSaveDelay = 1500,
}: XmlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);

  const [currentValue, setCurrentValue] = useState(value);
  const [lastPublishedValue, setLastPublishedValue] = useState(value); // Last persisted value (for Cmd+S check)
  const [parseError, setParseError] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");

  // Refs for auto-save
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAutoSaveRef = useRef<string | null>(null);

  // Refs for values needed in keyboard shortcut callback (avoids stale closure)
  const currentValueRef = useRef(currentValue);
  const lastPublishedValueRef = useRef(lastPublishedValue);
  const onSaveRef = useRef(onSave);
  const parseErrorRef = useRef(parseError);

  // Calculate if there are unsaved changes (for status display)
  const hasUnsavedChanges = currentValue !== lastPublishedValue;

  // Keep refs in sync
  useEffect(() => {
    currentValueRef.current = currentValue;
  }, [currentValue]);

  useEffect(() => {
    lastPublishedValueRef.current = lastPublishedValue;
  }, [lastPublishedValue]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    parseErrorRef.current = parseError;
  }, [parseError]);

  // Sync with external value prop changes
  // Only reset if the new value is different from what we have
  useEffect(() => {
    console.log("[XmlEditor] value prop changed", {
      valueLength: value?.length,
      currentValueLength: currentValue?.length,
      valuesMatch: value === currentValue,
      valuePreview: value?.slice(0, 100),
      currentValuePreview: currentValue?.slice(0, 100),
    });

    // If external value matches current editor content, no reset needed
    if (value === currentValue) {
      console.log("[XmlEditor] value matches currentValue, updating lastPublishedValue");
      setLastPublishedValue(value);
      return;
    }

    // External value changed and differs from editor - reset editor
    console.log("[XmlEditor] RESETTING editor to new value");
    setCurrentValue(value);
    setLastPublishedValue(value);
    setAutoSaveStatus("idle");
    setParseError(null);

    // Clear any pending auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    pendingAutoSaveRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentValue is intentionally excluded to prevent infinite loops
  }, [value]); // Only depend on value, not currentValue

  // Validate XML
  const validateXml = useCallback((xml: string): string | null => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "application/xml");
      const errorNode = doc.querySelector("parsererror");
      if (errorNode) {
        const errorText = errorNode.textContent || "XML parse error";
        const match = errorText.match(/error on line (\d+)/i);
        if (match) {
          return `Error on line ${match[1]}`;
        }
        return errorText.slice(0, 100);
      }
      return null;
    } catch {
      return "Invalid XML";
    }
  }, []);

  // Auto-save function
  const performAutoSave = useCallback(
    async (content: string) => {
      console.log("[XmlEditor] performAutoSave called", {
        contentLength: content?.length,
        readOnly,
        hasOnAutoSave: !!onAutoSave,
      });
      if (!onAutoSave || readOnly) return;

      // Don't auto-save if there's a parse error
      const error = validateXml(content);
      if (error) {
        console.log("[XmlEditor] performAutoSave skipped - parse error:", error);
        return;
      }

      setAutoSaveStatus("saving");
      try {
        console.log("[XmlEditor] Calling onAutoSave...");
        await onAutoSave(content);
        console.log(
          "[XmlEditor] onAutoSave completed, pendingAutoSaveRef:",
          pendingAutoSaveRef.current,
        );
        setLastPublishedValue(content);
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus("idle"), 2000);
      } catch (e) {
        logError("[XmlEditor] Auto-save failed:", e);
        setAutoSaveStatus("error");
      }
    },
    [onAutoSave, readOnly, validateXml],
  );

  // Schedule auto-save (debounced)
  const scheduleAutoSave = useCallback(
    (content: string) => {
      if (!onAutoSave || readOnly) return;

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      pendingAutoSaveRef.current = content;
      setAutoSaveStatus("pending");

      autoSaveTimerRef.current = setTimeout(() => {
        pendingAutoSaveRef.current = null;
        performAutoSave(content);
      }, autoSaveDelay);
    },
    [onAutoSave, readOnly, autoSaveDelay, performAutoSave],
  );

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // @ts-expect-error Monaco XML extension types not available
      monaco.languages.xml?.xmlDefaults?.setOptions?.({ format: { splitAttributes: true } });

      // Cmd+S shortcut
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        const contentChanged = currentValueRef.current !== lastPublishedValueRef.current;
        const shouldSave = contentChanged;
        console.log("[XmlEditor] Cmd+S pressed", {
          contentChanged,
          shouldSave,
          hasOnSave: !!onSaveRef.current,
          hasParseError: !!parseErrorRef.current,
          currentValueLength: currentValueRef.current?.length,
          lastPublishedValueLength: lastPublishedValueRef.current?.length,
        });
        if (onSaveRef.current && shouldSave && !parseErrorRef.current) {
          console.log("[XmlEditor] Calling onSave...");
          // Update lastPublishedValue optimistically; onSave persists immediately
          setLastPublishedValue(currentValueRef.current);
          onSaveRef.current(currentValueRef.current);
        } else {
          console.log("[XmlEditor] NOT calling onSave - conditions not met");
        }
      });

      if (completionProvider) {
        const disposable = monaco.languages.registerCompletionItemProvider("xml", {
          triggerCharacters: ["<", " ", '"'],
          provideCompletionItems: (model: editor.ITextModel, position: Position) => {
            const items = completionProvider(monaco, model, position);
            return { suggestions: items };
          },
        });
        disposablesRef.current.push(disposable);
      }

      editor.focus();
    },
    [completionProvider],
  );

  const handleChange: OnChange = useCallback(
    (newValue) => {
      if (newValue !== undefined) {
        setCurrentValue(newValue);
        setParseError(validateXml(newValue));

        // If content differs from last persisted, schedule auto-save
        if (newValue !== lastPublishedValueRef.current) {
          scheduleAutoSave(newValue);
        }
      }
    },
    [validateXml, scheduleAutoSave],
  );

  // Cleanup disposables
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
    };
  }, []);

  // Status indicator
  const renderStatus = () => {
    if (readOnly) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Read-only</span>
        </div>
      );
    }

    if (parseError) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>{parseError}</span>
        </div>
      );
    }

    if (isSaving) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Saving...</span>
        </div>
      );
    }

    if (autoSaveStatus === "saving") {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Saving...</span>
        </div>
      );
    }

    if (autoSaveStatus === "pending" || hasUnsavedChanges) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CloudOff className="h-3.5 w-3.5" />
          <span>Unsaved changes</span>
        </div>
      );
    }

    if (autoSaveStatus === "error") {
      return (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Auto-save failed</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 text-xs text-success">
        <Cloud className="h-3.5 w-3.5" />
        <span>Saved</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight }}>
      {/* Status bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-1">
        <div className="flex items-center gap-3">{renderStatus()}</div>
        {!readOnly && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">⌘S</kbd>
            <span>to save</span>
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1" style={{ height }}>
        <Editor
          height="100%"
          language="xml"
          theme="vs-dark"
          value={currentValue}
          onChange={handleChange}
          onMount={handleEditorMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            formatOnPaste: true,
            formatOnType: true,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          }}
          loading={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        />
      </div>
    </div>
  );
}
