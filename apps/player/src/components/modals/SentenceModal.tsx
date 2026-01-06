import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "motion/react";
import { FileText, CheckCircle, ArrowDownUp } from "lucide-react";

import ModalUI from "./ModalUI";
import { Button } from "@player/components/ui/button";
import { findSimplifiedSentence } from "@player/helpers/findSimplifiedSentence";

const stripHtml = (html: string | undefined): string => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
};

interface SentenceModalProps {
  onClose: () => void;
  currentSentenceId?: string;
  currentSentence?: string;
  simplifiedSentence?: string;
  simplifiedSentenceScore?: number;
}

const SentenceModal: React.FC<SentenceModalProps> = ({
  onClose,
  currentSentenceId,
  currentSentence,
  simplifiedSentence,
  simplifiedSentenceScore,
}) => {
  const { t } = useTranslation();
  const [currentSimplifiedSentence, setSimplifiedSentence] = useState(simplifiedSentence);
  const [currentSimplifiedScore, setSimplifiedSentenceScore] = useState(simplifiedSentenceScore);
  const [isMoreSimplifiedSentence, setIsMoreSimplifiedSentence] = useState(
    Boolean(simplifiedSentence),
  );

  const handleClick = () => {
    if (!currentSimplifiedSentence) return;
    const {
      text,
      score: newScore,
      hasLower,
    } = findSimplifiedSentence(currentSentenceId, currentSimplifiedScore);

    if (text) {
      setSimplifiedSentence(text);
      setSimplifiedSentenceScore(newScore);
    }
    setIsMoreSimplifiedSentence(hasLower);
  };

  const handleUndo = () => {
    const sentenceElement = document.getElementById(currentSentenceId);
    if (sentenceElement) {
      sentenceElement.innerHTML = currentSentence;
      sentenceElement.removeAttribute("data-simplified");
      sentenceElement.removeAttribute("data-original-sentence");
      sentenceElement.setAttribute("data-current-score", "0");
    }
    onClose();
  };

  const modalTitle = (
    <div className="flex items-center gap-2">
      <ArrowDownUp size={20} className="mb-1" />
      <span>{t("sentence_simplification")}</span>
    </div>
  );

  return (
    <ModalUI title={modalTitle} onClose={onClose} size="xl">
      <motion.div
        className="flex flex-col h-full relative overflow-hidden"
        variants={variants.container}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
      >
        <div className="flex-1 flex flex-col min-h-0 relative z-10">
          <div className="flex-1 space-y-6 pb-4">
            <motion.div
              className="group relative overflow-hidden rounded-xl border border-book-primary-20 bg-gradient-to-r from-book-primary-10 to-book-primary-20"
              variants={variants.item}
            >
              <div className="relative p-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="px-3 py-1 rounded-full text-xs font-medium bg-book-primary-30 text-book-primary">
                    <span className="flex items-center gap-1">
                      <FileText size={12} />
                      {t("original_sentence")}
                    </span>
                  </div>
                </div>
                <motion.div
                  className="text-white/90 leading-relaxed font-medium"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
                >
                  {stripHtml(currentSentence)}
                </motion.div>
              </div>
            </motion.div>

            {currentSimplifiedSentence && (
              <motion.div
                className="group relative overflow-hidden rounded-xl border border-book-tertiary-20 bg-gradient-to-r from-book-tertiary-10 to-book-tertiary-20"
                variants={variants.item}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="relative p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="px-3 py-1 rounded-full text-xs font-medium bg-book-tertiary-30 text-book-tertiary">
                      <span className="flex items-center gap-1">
                        <CheckCircle size={12} />
                        {t("simplified_version")}
                      </span>
                    </div>
                  </div>
                  <motion.div
                    className="text-white/90 leading-relaxed font-medium"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
                  >
                    {stripHtml(currentSimplifiedSentence)}
                  </motion.div>
                </div>
              </motion.div>
            )}
          </div>

          <div className="flex-shrink-0 pt-4 pb-2">
            <motion.div
              className="flex justify-center gap-4"
              variants={variants.item}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Button
                onClick={handleUndo}
                size="lg"
                className="cursor-pointer bg-gradient-to-r from-book-primary to-book-tertiary text-white shadow-lg hover:shadow-xl border border-book-primary-30 hover:from-book-primary/90 hover:to-book-tertiary/90"
              >
                {t("undo_simplification")}
              </Button>
              <Button
                className={`
                  min-w-[200px] cursor-pointer
                  ${
                    isMoreSimplifiedSentence
                      ? "bg-gradient-to-r from-book-primary to-book-tertiary text-white shadow-lg hover:shadow-xl border border-book-primary-30 hover:from-book-primary/90 hover:to-book-tertiary/90"
                      : "bg-book-secondary-20 text-white/50 border border-book-secondary-30 cursor-not-allowed hover:bg-book-secondary-20"
                  }
                `}
                onClick={handleClick}
                disabled={!isMoreSimplifiedSentence}
                size="lg"
              >
                <ArrowDownUp
                  size={16}
                  className={isMoreSimplifiedSentence ? "text-white" : "text-white/50"}
                />
                {isMoreSimplifiedSentence
                  ? t("get_simplified_sentence")
                  : t("no_further_simplification")}
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </ModalUI>
  );
};

const variants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.3, ease: "easeOut", staggerChildren: 0.1 },
    },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
  },
  item: {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
  },
};

export default SentenceModal;
