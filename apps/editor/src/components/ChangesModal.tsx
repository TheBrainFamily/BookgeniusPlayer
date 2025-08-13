import { useState } from "react";
import { useChangesStore, type FileChange } from "../stores/changesStore";
import { useBooksStore } from "../stores/booksStore";
import * as diff from "diff";

interface ChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookName: string;
}

export const ChangesModal = ({ isOpen, onClose, bookName }: ChangesModalProps) => {
  const { getCurrentBookChanges, removeChange } = useChangesStore();
  const { setCurrentChapterContent, chapters, currentFile } = useBooksStore();
  const [selectedChange, setSelectedChange] = useState<FileChange | null>(null);
  
  if (!isOpen) return null;

  const changes = getCurrentBookChanges(bookName);

  // Set initial selected change if none selected
  if (changes.length > 0 && !selectedChange) {
    setSelectedChange(changes[0]);
  }

  const generateDiffLines = (change: FileChange) => {
    const differences = diff.diffLines(change.originalContent, change.currentContent);
    
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
          const removedLines = part.value.split('\n').filter(l => l !== '');
          const addedLines = nextPart.value.split('\n').filter(l => l !== '');
          
          if (removedLines.length === 1 && addedLines.length === 1) {
            // Single line change - do word-level diff
            const wordDiffs = diff.diffWordsWithSpace(removedLines[0], addedLines[0]);
            
            // Create processed removed line
            processedDifferences.push({
              ...part,
              wordDiffs: wordDiffs,
              isWordDiff: true
            });
            
            // Create processed added line
            processedDifferences.push({
              ...nextPart,
              wordDiffs: wordDiffs,
              isWordDiff: true
            });
            
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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleDiscardChange = (change: FileChange) => {
    // Remove from change tracking first
    removeChange(bookName, change.filePath);
    
    // Revert the content in the editor
    if (change.type === 'chapter') {
      // For chapters, revert the editor content
      setCurrentChapterContent(change.originalContent);
    }
    // For variants, we would need to revert variant changes (TODO: implement variant reversion)
    
    // If no more changes, close modal
    if (getCurrentBookChanges(bookName).length <= 1) {
      onClose();
    }
  };

  return (
    <div className="changes-modal-backdrop" onClick={handleBackdropClick}>
      <div className="changes-modal">
        {/* Header */}
        <div className="changes-modal-header">
          <h2>Unsaved Changes - {bookName}</h2>
          <button className="changes-modal-close" onClick={onClose}>×</button>
        </div>

        {/* Main content with two panels */}
        <div className="changes-modal-body">
          {/* Left Panel - File List */}
          <div className="changes-file-list">
            <div className="file-list-header">
              <h3>Changed Files ({changes.length})</h3>
            </div>
            <div className="file-list-content">
              {changes.length === 0 ? (
                <div className="no-changes">No unsaved changes</div>
              ) : (
                changes.map((change) => (
                  <div
                    key={change.filePath}
                    className={`file-list-item ${selectedChange?.filePath === change.filePath ? 'selected' : ''}`}
                    onClick={() => setSelectedChange(change)}
                  >
                    <div className="file-item-info">
                      <span className={`change-type ${change.type}`}>
                        {change.type === 'chapter' ? '📄' : '🔄'}
                      </span>
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
                        if (selectedChange?.filePath === change.filePath) {
                          const remainingChanges = changes.filter(c => c.filePath !== change.filePath);
                          setSelectedChange(remainingChanges.length > 0 ? remainingChanges[0] : null);
                        }
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Panel - Diff View */}
          <div className="changes-diff-panel">
            {selectedChange ? (
              <>
                <div className="diff-panel-header">
                  <div className="diff-file-info">
                    <span className={`change-type ${selectedChange.type}`}>
                      {selectedChange.type === 'chapter' ? '📄' : '🔄'}
                    </span>
                    <span className="diff-file-path">{selectedChange.filePath}</span>
                  </div>
                  <button
                    className="discard-change-btn"
                    onClick={() => {
                      handleDiscardChange(selectedChange);
                      const remainingChanges = changes.filter(c => c.filePath !== selectedChange.filePath);
                      setSelectedChange(remainingChanges.length > 0 ? remainingChanges[0] : null);
                    }}
                  >
                    Discard Changes
                  </button>
                </div>

                <div className="diff-container">
                  <div className="diff-lines">
                    {generateDiffLines(selectedChange).map((part, index) => {
                      const lines = part.value.split('\n').filter(line => line !== '');
                      
                      return lines.map((line, lineIndex) => (
                        <div 
                          key={`${index}-${lineIndex}`} 
                          className={`diff-line ${
                            part.added ? 'diff-line-added' : 
                            part.removed ? 'diff-line-removed' : 'diff-line-context'
                          }`}
                        >
                          <span className="diff-line-number">
                            {part.added ? '+' : part.removed ? '-' : ' '}
                          </span>
                          <span className="diff-line-content">
                            {renderLineWithWordHighlighting(part, line)}
                          </span>
                        </div>
                      ));
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="no-selection">
                <p>Select a file from the list to view changes</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="changes-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};