"use client";

/**
 * XmlEditor - Monaco editor wrapper for XML files
 *
 * Features:
 * - XML syntax highlighting
 * - Auto-formatting
 * - Error indicators
 * - Dark/light theme support
 * - Custom completion provider slot (for character autocomplete)
 */

import { useRef, useCallback, useEffect, useState } from "react";
import Editor, { OnMount, OnChange } from "@monaco-editor/react";
import type { editor, IDisposable, Position, IRange } from "monaco-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, RotateCcw, Loader2, AlertCircle } from "lucide-react";

// =============================================================================
// Types
// =============================================================================

export interface XmlEditorProps {
  /** Initial XML content */
  value: string;
  /** Called when content changes (debounced) */
  onChange?: (value: string) => void;
  /** Called when save is triggered (Ctrl+S or button) */
  onSave?: (value: string) => Promise<void>;
  /** Custom completion items provider */
  completionProvider?: (
    monaco: typeof import("monaco-editor"),
    model: editor.ITextModel,
    position: import("monaco-editor").Position,
  ) => import("monaco-editor").languages.CompletionItem[];
  /** Whether the editor is in read-only mode */
  readOnly?: boolean;
  /** Loading state during save */
  isSaving?: boolean;
  /** Height of the editor (default: 100%) */
  height?: string;
  /** Minimum height */
  minHeight?: string;
}

// =============================================================================
// Component
// =============================================================================

export function XmlEditor({ value, onChange, onSave, completionProvider, readOnly = false, isSaving = false, height = "100%", minHeight = "400px" }: XmlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);

  const [currentValue, setCurrentValue] = useState(value);
  const [hasChanges, setHasChanges] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Refs for values needed in keyboard shortcut callback (avoids stale closure)
  const currentValueRef = useRef(currentValue);
  const hasChangesRef = useRef(hasChanges);
  const onSaveRef = useRef(onSave);

  // Keep refs in sync
  useEffect(() => {
    currentValueRef.current = currentValue;
  }, [currentValue]);

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Update when external value changes
  useEffect(() => {
    if (value !== currentValue && !hasChanges) {
      setCurrentValue(value);
    }
  }, [value, currentValue, hasChanges]);

  // Validate XML on change
  const validateXml = useCallback((xml: string): string | null => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "application/xml");
      const errorNode = doc.querySelector("parsererror");
      if (errorNode) {
        // Extract error message
        const errorText = errorNode.textContent || "XML parse error";
        // Simplify the error message
        const match = errorText.match(/error on line (\d+)/i);
        if (match) {
          return `Error on line ${match[1]}`;
        }
        return errorText.slice(0, 100);
      }
      return null;
    } catch (e) {
      return "Invalid XML";
    }
  }, []);

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Configure XML language
      // @ts-ignore
      monaco.languages.xml?.xmlDefaults?.setOptions?.({ format: { splitAttributes: true } });

      // Add keyboard shortcut for save (uses refs to avoid stale closure)
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (onSaveRef.current && hasChangesRef.current) {
          onSaveRef.current(currentValueRef.current);
        }
      });

      // Register custom completion provider if provided
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

      // Focus editor
      editor.focus();
    },
    [completionProvider],
  );

  const handleChange: OnChange = useCallback(
    (newValue) => {
      if (newValue !== undefined) {
        setCurrentValue(newValue);
        setHasChanges(newValue !== value);
        setParseError(validateXml(newValue));
        onChange?.(newValue);
      }
    },
    [value, onChange, validateXml],
  );

  const handleSave = useCallback(async () => {
    if (onSave && hasChanges && !parseError) {
      await onSave(currentValue);
      setHasChanges(false);
    }
  }, [onSave, hasChanges, parseError, currentValue]);

  const handleReset = useCallback(() => {
    setCurrentValue(value);
    setHasChanges(false);
    setParseError(validateXml(value));
    if (editorRef.current) {
      editorRef.current.setValue(value);
    }
  }, [value, validateXml]);

  // Cleanup disposables
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
    };
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ minHeight }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-1">
        <div className="flex items-center gap-2">
          <Badge variant={hasChanges ? "warning" : "muted"} className="text-xs">
            {hasChanges ? "Modified" : "Saved"}
          </Badge>
          {parseError && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              <span>{parseError}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={isSaving}>
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
          <Button variant={hasChanges ? "default" : "outline"} size="sm" onClick={handleSave} disabled={!hasChanges || isSaving || !!parseError || readOnly}>
            {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
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
