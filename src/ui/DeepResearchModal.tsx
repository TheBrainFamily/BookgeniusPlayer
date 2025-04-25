import React from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { LLMAnswerViewer } from "./MarkdownComponent"; // Assuming this is the correct path

interface DeepResearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  passedText?: string;
}

export const DeepResearchModal: React.FC<DeepResearchModalProps> = ({ isOpen, onClose, passedText }) => {
  if (!isOpen) {
    return null;
  }

  const modalRoot = document.getElementById("deep-research-root");

  if (!modalRoot) {
    console.error("The element #deep-research-root was not found in the DOM.");
    return null; // Or render an error message
  }

  return ReactDOM.createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9]" // High z-index, below the modal content
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        className="fixed inset-0 z-[99] flex items-center justify-center p-4" // Highest z-index
        role="dialog"
        aria-modal="true"
        aria-labelledby="deep-research-title"
      >
        <div className="bg-background text-foreground rounded-lg shadow-xl w-full max-w-4xl h-[90vh] max-h-[800px] flex flex-col relative overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 id="deep-research-title" className="text-lg font-semibold">
              Deep Research
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Close deep research modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            <LLMAnswerViewer answerMarkdown={passedText} />
          </div>
        </div>
      </div>
    </>,
    modalRoot,
  );
};
