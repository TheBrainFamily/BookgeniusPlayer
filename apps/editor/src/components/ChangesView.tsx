import { useState } from "react";
import { useChangesStore, type FileChange } from "../stores/changesStore";
import { useBooksStore } from "../stores/booksStore";
import { navigateToEditorView } from "../utils/updateUrlView";
import { useSaveAllChanges } from "../hooks/useSaveAllChanges";
import * as diff from "diff";

export const ChangesView = () => {
  const { getAllChangesGroupedByBook, removeChange } = useChangesStore();
  const { setCurrentChapterContent, currentBook } = useBooksStore();
  const { saveAllChanges } = useSaveAllChanges();
  const [selectedChange, setSelectedChange] = useState<FileChange | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ successes: string[]; errors: string[] } | null>(null);
  const allChangesGrouped = getAllChangesGroupedByBook();
  const allChanges = Object.values(allChangesGrouped).flat();
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set(Object.keys(allChangesGrouped)));

  console.log("16: allChanges BANG!", allChanges);

  // Set initial selected change if none selected
  if (allChanges.length > 0 && !selectedChange) {
    setSelectedChange(allChanges[0]);
  }

  const toggleBookExpanded = (bookName: string) => {
    const newExpanded = new Set(expandedBooks);
    if (newExpanded.has(bookName)) {
      newExpanded.delete(bookName);
    } else {
      newExpanded.add(bookName);
    }
    setExpandedBooks(newExpanded);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    
    try {
      const result = await saveAllChanges();
      setSaveStatus(result);
      
      // If all saved successfully, navigate back to editor
      if (result.errors.length === 0) {
        setTimeout(() => {
          navigateToEditorView();
        }, 1500); // Give user time to see success message
      }
    } catch (error) {
      console.error('Error saving all changes:', error);
      setSaveStatus({ 
        successes: [], 
        errors: ['An unexpected error occurred while saving'] 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const generateDiffLines = (change: FileChange) => {
    // Convert objects to formatted JSON strings for diffing if needed
    const originalStr = typeof change.originalContent === 'string' 
      ? change.originalContent 
      : JSON.stringify(change.originalContent, null, 2);
    const currentStr = typeof change.currentContent === 'string' 
      ? change.currentContent 
      : JSON.stringify(change.currentContent, null, 2);
      
    const differences = diff.diffLines(originalStr, currentStr);

    // Process the differences to add word-level highlighting
    const processedDifferences = [];

    for (let i = 0; i < differences.length; i++) {
      const part = differences[i];

      if (!part.added && !part.removed) {
        // Context line, no changes
        processedDifferences.push(part);
      } else {
        // This is a changed line, check if we can do word-level diffing
        const nextPart = differences[i + 1];

        if (part.removed && nextPart && nextPart.added) {
          // We have a removed line followed by an added line - perfect for word diffing
          const removedLines = part.value.split("\n").filter((l) => l !== "");
          const addedLines = nextPart.value.split("\n").filter((l) => l !== "");

          if (removedLines.length === 1 && addedLines.length === 1) {
            // Single line change - do word-level diff
            const wordDiffs = diff.diffWordsWithSpace(removedLines[0], addedLines[0]);

            // Create processed removed line
            processedDifferences.push({ ...part, wordDiffs: wordDiffs, isWordDiff: true });

            // Create processed added line
            processedDifferences.push({ ...nextPart, wordDiffs: wordDiffs, isWordDiff: true });

            i++; // Skip the next part since we processed it
            continue;
          }
        }

        // Regular added/removed line without word-level diffing
        processedDifferences.push(part);
      }
    }

    return processedDifferences;
  };

  const renderLineWithWordHighlighting = (part: any, line: string) => {
    if (!part.isWordDiff || !part.wordDiffs) {
      return line;
    }

    // Render with word-level highlighting
    return (
      <span>
        {part.wordDiffs.map((wordPart: any, idx: number) => {
          if (wordPart.added && part.added) {
            return (
              <span key={idx} className="word-highlight-added">
                {wordPart.value}
              </span>
            );
          } else if (wordPart.removed && part.removed) {
            return (
              <span key={idx} className="word-highlight-removed">
                {wordPart.value}
              </span>
            );
          } else if (!wordPart.added && !wordPart.removed) {
            return <span key={idx}>{wordPart.value}</span>;
          }
          return null;
        })}
      </span>
    );
  };

  const handleDiscardChange = (change: FileChange) => {
    // Remove from change tracking first
    removeChange(change.bookName, change.filePath);

    // Revert the content in the editor if it's for the current book
    if (change.bookName === currentBook) {
      if (change.type === "chapter") {
        // For chapters, revert the editor content
        setCurrentChapterContent(change.originalContent as string);
      } else if (change.type === "variant") {
        // For variants, we'd need to convert the object back to XML and update the variant
        // This would require access to variant update functionality
        console.log("Reverting variant:", change.filePath, change.originalContent);
        // TODO: Implement variant reversion by converting object back to XML
      }
    }

    // If no more changes across all books, go back to editor
    const remainingChanges = Object.values(getAllChangesGroupedByBook()).flat();
    if (remainingChanges.length <= 1) {
      navigateToEditorView();
    }
  };

  return (
    <div className="changes-view">
      {/* Header */}
      <div className="changes-view-header">
        <div className="changes-view-title">
          <button className="back-to-editor-btn" onClick={() => navigateToEditorView()}>
            ← Back to Editor
          </button>
          <h1>Changes Review - All Books</h1>
        </div>
        <div className="changes-view-actions">
          <button 
            className="save-all-btn"
            onClick={handleSaveAll}
            disabled={isSaving || allChanges.length === 0}
          >
            {isSaving ? 'Saving...' : `Save All Changes (${allChanges.length})`}
          </button>
        </div>
      </div>

      {/* Save Status Messages */}
      {saveStatus && (
        <div className="save-status">
          {saveStatus.successes.length > 0 && (
            <div className="save-status-success">
              <h3>✅ Successfully saved:</h3>
              <ul>
                {saveStatus.successes.map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          {saveStatus.errors.length > 0 && (
            <div className="save-status-error">
              <h3>❌ Errors occurred:</h3>
              <ul>
                {saveStatus.errors.map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="changes-view-body">
        {/* Left Panel - File List */}
        <div className="changes-file-sidebar">
          <div className="file-list-header">
            <h3>Changed Files ({allChanges.length} across {Object.keys(allChangesGrouped).length} books)</h3>
          </div>
          <div className="file-list-content">
            {allChanges.length === 0 ? (
              <div className="no-changes">No unsaved changes</div>
            ) : (
              Object.entries(allChangesGrouped).map(([bookName, bookChanges]) => (
                <div key={bookName} className="book-section">
                  <div 
                    className="book-section-header" 
                    onClick={() => toggleBookExpanded(bookName)}
                  >
                    <span className={`dropdown-icon ${expandedBooks.has(bookName) ? "expanded" : ""}`}>▶</span>
                    <span className="book-title">{bookChanges[0]?.bookTitle || bookName}</span>
                    <span className="book-change-count">({bookChanges.length})</span>
                  </div>
                  {expandedBooks.has(bookName) && (
                    <div className="book-files">
                      {bookChanges.map((change) => (
                        <div 
                          key={`${change.bookName}-${change.filePath}`} 
                          className={`file-list-item ${selectedChange?.filePath === change.filePath && selectedChange?.bookName === change.bookName ? "selected" : ""}`} 
                          onClick={() => setSelectedChange(change)}
                        >
                          <div className="file-item-info">
                            <span className={`change-type ${change.type}`}>{change.type === "chapter" ? "📄" : "🔄"}</span>
                            <div className="file-item-details">
                              <span className="file-path">{change.filePath}</span>
                              <span className="file-timestamp">
                                {new Date(change.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                          <button
                            className="file-discard-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDiscardChange(change);
                              // If this was the selected change, select another one
                              if (selectedChange?.filePath === change.filePath && selectedChange?.bookName === change.bookName) {
                                const remainingChanges = allChanges.filter((c) => !(c.filePath === change.filePath && c.bookName === change.bookName));
                                setSelectedChange(remainingChanges.length > 0 ? remainingChanges[0] : null);
                              }
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Diff View */}
        <div className="changes-main-panel">
          {selectedChange ? (
            <>
              <div className="diff-panel-header">
                <div className="diff-file-info">
                  <span className={`change-type ${selectedChange.type}`}>{selectedChange.type === "chapter" ? "📄" : "🔄"}</span>
                  <span className="diff-file-path">{selectedChange.filePath}</span>
                </div>
                <button
                  className="discard-change-btn"
                  onClick={() => {
                    handleDiscardChange(selectedChange);
                    const remainingChanges = allChanges.filter((c) => !(c.filePath === selectedChange.filePath && c.bookName === selectedChange.bookName));
                    setSelectedChange(remainingChanges.length > 0 ? remainingChanges[0] : null);
                  }}
                >
                  Discard Changes
                </button>
              </div>

              <div className="diff-container">
                <div className="diff-lines">
                  {generateDiffLines(selectedChange).map((part, index) => {
                    const lines = part.value.split("\n").filter((line) => line !== "");

                    return lines.map((line, lineIndex) => (
                      <div key={`${index}-${lineIndex}`} className={`diff-line ${part.added ? "diff-line-added" : part.removed ? "diff-line-removed" : "diff-line-context"}`}>
                        <span className="diff-line-number">{part.added ? "+" : part.removed ? "-" : " "}</span>
                        <span className="diff-line-content">{renderLineWithWordHighlighting(part, line)}</span>
                      </div>
                    ));
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="no-selection">
              <p>Select a file from the sidebar to view changes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
