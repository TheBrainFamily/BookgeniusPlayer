import React from "react";
import { motion, Variants } from "motion/react";
import { Brain, FileSearch } from "lucide-react";

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
  const modalTitle = (
    <div className="flex items-center gap-2">
      <Brain size={20} className="mb-1" />
      <span>Deep Research</span>
    </div>
  );

  return (
    <ModalUI title={modalTitle} onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay}>
      <motion.div className="flex flex-col h-full relative overflow-hidden" variants={variants.container} initial="hidden" animate="visible" exit="exit">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-2xl bg-book-gradient-primary-tertiary" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full opacity-8 blur-xl bg-book-gradient-secondary-quaternary" />
        </div>
        {isLoading && (
          <motion.div className="flex flex-col items-center justify-center py-12 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="relative">
              <motion.div
                className="w-12 h-12 border-3 rounded-full border-book-primary-30 border-t-book-primary"
                variants={variants.loading}
                initial="initial"
                animate="animate"
              />
              <motion.div
                className="absolute inset-0 w-12 h-12 border-3 border-transparent rounded-full border-t-book-tertiary-50"
                variants={variants.loading}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.1 }}
              />
            </div>
            <motion.div className="mt-4 text-white/90 font-medium" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              Researching...
            </motion.div>
          </motion.div>
        )}
        {content && !isLoading && (
          <motion.div className="flex-grow overflow-y-auto px-4 pb-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <motion.div className="relative overflow-hidden" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.3 }}>
              <motion.div className="absolute inset-0 opacity-10 bg-book-gradient-shimmer" variants={variants.shimmer} initial="initial" animate="animate" />

              <div className="prose dark:prose-invert max-w-none text-white/90">
                <LLMAnswerViewer answerMarkdown={content} />
              </div>
            </motion.div>
          </motion.div>
        )}
        {!content && !isLoading && (
          <motion.div
            className="flex flex-col items-center justify-center py-12 text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
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
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut", staggerChildren: 0.1 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
  },
  loading: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } } },
  shimmer: { initial: { x: "-100%" }, animate: { x: "100%", transition: { duration: 2, ease: "easeInOut", repeat: Infinity, repeatDelay: 1 } } },
};

export default DeepResearchModal;
