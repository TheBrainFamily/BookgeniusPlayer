import React from "react";
import ModalUI from "./ModalUI";
import { LLMAnswerViewer } from "@/ui/MarkdownComponent";

interface DeepResearchModalProps {
  onClose: () => void;
  content?: string;
  layoutView?: boolean;
  hideOverlay?: boolean;
}

const DeepResearchModal: React.FC<DeepResearchModalProps> = ({ onClose, content, layoutView, hideOverlay }) => {
  return (
    <ModalUI title="Deep Research" onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay}>
      <div className="prose dark:prose-invert max-w-none">
        <LLMAnswerViewer answerMarkdown={content} />
      </div>
    </ModalUI>
  );
};

export default DeepResearchModal;
