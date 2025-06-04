import React from "react";

import ModalUI from "./ModalUI";
import { LLMAnswerViewer } from "@/ui/MarkdownComponent";

interface DeepResearchModalProps {
  onClose: () => void;
  content?: string;
  layoutView?: boolean;
  hideOverlay?: boolean;
  isLoading?: boolean;
}

const DeepResearchModal: React.FC<DeepResearchModalProps> = ({ onClose, content, layoutView, hideOverlay, isLoading }) => {
  return (
    <ModalUI title="Deep Research" onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay}>
      <div className="flex flex-col h-full p-4">
        {isLoading && (
          <div className="flex items-center justify-center my-4 py-4">
            <svg className="animate-spin -ml-1 mr-3 w-4 h-4 lg:w-5 lg:h-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="text-white/90">Researching...</span>
          </div>
        )}
        {content && !isLoading && (
          <div className="flex-grow overflow-y-auto">
            <div className="prose dark:prose-invert max-w-none text-white/90">
              <LLMAnswerViewer answerMarkdown={content} />
            </div>
          </div>
        )}
        {!content && !isLoading && (
          <div className="flex-grow flex items-center justify-center">
            <p className="text-center text-white/60 py-4">No research results to display</p>
          </div>
        )}
      </div>
    </ModalUI>
  );
};

export default DeepResearchModal;
