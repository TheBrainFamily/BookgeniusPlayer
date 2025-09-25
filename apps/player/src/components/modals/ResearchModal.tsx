import React from "react";
import { motion, Variants, AnimatePresence } from "motion/react";
import { Brain, FileSearch, Telescope, Loader2 } from "lucide-react";

import ModalUI from "./ModalUI";
import { LLMAnswerViewer } from "@player/ui/MarkdownComponent";
import { Button } from "@player/components/ui/button";

interface DeepResearchModalProps {
  onClose: () => void;
  content?: string;
  layoutView?: boolean;
  hideOverlay?: boolean;
  isLoading?: boolean;
  type: "deep" | "ask";
  canDiveDeeper?: boolean;
  onDiveDeeper?: (() => void) | undefined;
  isDiveDeeperLoading?: boolean;
}

const DeepResearchModal: React.FC<DeepResearchModalProps> = ({ onClose, content, layoutView, hideOverlay, isLoading, canDiveDeeper, onDiveDeeper, isDiveDeeperLoading, type }) => {
  const modalTitle = (
    <div className="flex items-center gap-2">
      {type === "ask" ? <Brain size={20} /> : <Telescope size={20} />}
      <span>{type === "ask" ? "Quick Question" : "Deep Research"}</span>
    </div>
  );

  return (
    <ModalUI title={modalTitle} onClose={onClose} layoutView={layoutView} hideOverlay={hideOverlay}>
      <motion.div className="flex flex-col h-full relative overflow-hidden" variants={variants.container} initial="hidden" animate="visible" exit="exit">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              className="flex flex-col items-center justify-center py-12 px-4"
              variants={variants.loadingContainer}
              initial="hidden"
              animate="visible"
              exit="exit"
              key="loading"
            >
              <div className="relative">
                <motion.div
                  className="w-12 h-12 border-4 rounded-full border-book-primary-30 border-t-book-primary"
                  variants={variants.loading}
                  initial="initial"
                  animate="animate"
                />
                <motion.div
                  className="absolute inset-0 w-12 h-12 border-4 border-transparent rounded-full border-t-book-tertiary-50"
                  variants={variants.loadingDelayed}
                  initial="initial"
                  animate="animate"
                />
              </div>
              <motion.div className="mt-4 text-white/90 font-medium" variants={variants.loadingText} initial="hidden" animate="visible">
                {type === "ask" ? "Thinking..." : "Researching..."}
              </motion.div>
              <motion.div className="mt-2 text-white/60 text-sm" variants={variants.loadingSubtext} initial="hidden" animate="visible">
                {type === "ask" ? "Analyzing your question..." : "Exploring the book..."}
              </motion.div>
            </motion.div>
          ) : content ? (
            <motion.div className="flex-grow flex flex-col pb-2 min-h-0" variants={variants.contentContainer} initial="initial" animate="animate" key="content">
              <div className="flex-grow overflow-y-auto px-1 no-scrollbar">
                <AnimatePresence mode="wait">
                  <motion.div
                    key="content-text"
                    className="prose dark:prose-invert max-w-none text-white/90"
                    variants={variants.contentText}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <LLMAnswerViewer answerMarkdown={content} />
                  </motion.div>
                </AnimatePresence>
              </div>
              <AnimatePresence>
                {canDiveDeeper && (
                  <motion.div
                    className="mt-8 px-1 flex flex-col items-center"
                    variants={variants.diveDeeper}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    key="dive-deeper-section"
                  >
                    <Button
                      onClick={onDiveDeeper}
                      disabled={isDiveDeeperLoading}
                      className="rounded-full cursor-pointer bg-gradient-to-r from-book-primary-20 to-book-tertiary-20 border border-book-primary-30 text-white hover:from-book-primary-30 hover:to-book-tertiary-30 hover:border-book-primary-40 disabled:from-book-primary-20 disabled:to-book-tertiary-20 disabled:cursor-not-allowed"
                    >
                      <AnimatePresence mode="wait">
                        {isDiveDeeperLoading ? (
                          <motion.div key="loading" className="flex items-center gap-2" variants={variants.buttonContent} initial="hidden" animate="visible" exit="exit">
                            <Loader2 size={14} className="animate-spin" />
                            <span>Diving Deeper...</span>
                          </motion.div>
                        ) : (
                          <motion.div key="idle" className="flex items-center gap-2" variants={variants.buttonContent} initial="hidden" animate="visible" exit="exit">
                            <Telescope size={14} />
                            <span>Dive deeper</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Button>

                    <AnimatePresence>
                      {isDiveDeeperLoading && (
                        <motion.div className="mt-4 text-white/70 text-sm" variants={variants.gatheringText} initial="hidden" animate="visible" exit="exit">
                          Gathering detailed quotes...
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div className="flex flex-col items-center justify-center py-12 text-center" variants={variants.noResults} initial="initial" animate="animate" key="no-results">
              <div className="p-4 rounded-full mb-4 backdrop-blur-sm border bg-book-secondary-20 border-book-secondary-30">
                <FileSearch size={24} />
              </div>
              <p className="text-white/80 text-sm">No research results</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </ModalUI>
  );
};

const variants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
  },
  loading: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } } },
  loadingDelayed: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity, delay: 0.1 } } },
  loadingContainer: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.25, ease: "easeIn" } },
  },
  loadingText: { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { delay: 0.2 } } },
  loadingSubtext: { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { delay: 0.4 } } },
  contentContainer: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut", delay: 0.05 } },
    exit: { opacity: 0, y: 10, transition: { duration: 0.05, ease: "easeIn" } },
  },
  noResults: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut", delay: 0.1 } },
    exit: { opacity: 0, y: 10, transition: { duration: 0.2, ease: "easeIn" } },
  },
  diveDeeper: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { delay: 0.5, duration: 0.4, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.05, ease: "easeIn" } },
  },
  buttonContent: {
    hidden: { opacity: 0, scale: 0.8, y: 5 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.8, transition: { duration: 0.03, ease: "easeIn" } },
  },
  gatheringText: {
    hidden: { opacity: 0, y: 10, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.05 } },
  },
  contentText: {
    hidden: { opacity: 0, scale: 0.98 },
    visible: { opacity: 1, scale: 1, transition: { delay: 0.2, duration: 0.4, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.98, transition: { duration: 0.05, ease: "easeIn" } },
  },
};

export default DeepResearchModal;
