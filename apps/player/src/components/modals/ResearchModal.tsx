import React from "react";
import { motion, Variants } from "motion/react";
import { Brain, FileSearch, TelescopeIcon } from "lucide-react";

import ModalUI from "./ModalUI";
import { LLMAnswerViewer } from "@player/ui/MarkdownComponent";

interface ResearchModalProps {
  onClose: () => void;
  content?: string;
  layoutView?: boolean;
  hideOverlay?: boolean;
  isLoading?: boolean;
  state: "deep" | "ask";
}

const ResearchModal: React.FC<ResearchModalProps> = ({ onClose, content, layoutView, hideOverlay, isLoading, state }) => {
  const modalTitle = (
    <div className="flex items-center gap-2">
      {state === "ask" ? <Brain size={20} /> : <TelescopeIcon size={20} />}
      <span>{state === "ask" ? "Ask Search" : "Deep Research"}</span>
    </div>
  );

  return (
    <ModalUI title={modalTitle} onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay}>
      <motion.div className="flex flex-col h-full relative overflow-hidden" variants={variants.container} initial="hidden" animate="visible" exit="exit">
        {isLoading && (
          <motion.div className="flex flex-col items-center justify-center py-12 px-4" variants={variants.loadingContainer} initial="initial" animate="animate" exit="exit">
            <div className="relative">
              <motion.div
                className="w-12 h-12 border-4 rounded-full border-book-primary-30 border-t-book-primary"
                variants={variants.loading}
                initial="initial"
                animate="animate"
              />
              <motion.div
                className="absolute inset-0 w-12 h-12 border-4 border-transparent rounded-full border-t-book-tertiary-50"
                variants={variants.loading}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.1 }}
              />
            </div>
            <motion.div className="mt-4 text-white/90 font-medium" variants={variants.loadingText} initial="initial" animate="animate">
              Researching...
            </motion.div>
          </motion.div>
        )}
        {content && !isLoading && (
          <motion.div className="flex-grow overflow-y-auto -mt-2 pb-2" variants={variants.contentContainer} initial="initial" animate="animate">
            <motion.div className="relative overflow-hidden px-1" variants={variants.contentInner} initial="initial" animate="animate">
              <div className="prose dark:prose-invert max-w-none text-white/90">
                <LLMAnswerViewer answerMarkdown={content} />
              </div>
            </motion.div>
          </motion.div>
        )}
        {!content && !isLoading && (
          <motion.div className="flex flex-col items-center justify-center py-12 text-center" variants={variants.noResults} initial="initial" animate="animate">
            <div className="p-4 rounded-full mb-4 backdrop-blur-sm border bg-book-secondary-20 border-book-secondary-30">
              <FileSearch size={24} />
            </div>
            <p className="text-white/80 text-sm">No research results</p>
          </motion.div>
        )}
      </motion.div>
    </ModalUI>
  );
};

const variants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.22, ease: "easeOut", staggerChildren: 0.06 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.18 } },
  },
  loading: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } } },
  loadingContainer: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  loadingText: { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0, transition: { delay: 0.2 } } },
  contentContainer: { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.3 } } },
  contentInner: { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1, transition: { delay: 0.3, duration: 0.3 } } },
  noResults: { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0, transition: { delay: 0.3 } } },
};

export default ResearchModal;
