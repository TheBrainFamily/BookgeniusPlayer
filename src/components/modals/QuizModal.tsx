import React, { useState } from "react";
import { motion, Variants } from "motion/react";
import { HelpCircle, Check, X } from "lucide-react";

import ModalUI from "./ModalUI";
import { QuizAnswer, QuizQuestion } from "@/stores/modals/quizModal.store";

interface QuizModalProps {
  onClose: () => void;
  question: QuizQuestion;
}

const QuizModal: React.FC<QuizModalProps> = ({ onClose, question }) => {
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleAnswerSelect = (answerId: string) => {
    if (showResult) return;
    setSelectedAnswerId(answerId);
    setShowResult(true);

    setTimeout(() => {
      onClose();
    }, 3000);
  };

  const getAnswerButtonClasses = (answer: QuizAnswer) => {
    const baseClasses = "w-full p-6 text-left border-2 rounded-xl cursor-pointer relative overflow-hidden shadow-lg";

    if (!showResult) {
      return `${baseClasses} border-white/30 bg-white/5`;
    }

    if (answer.isCorrect) {
      return `${baseClasses} border-green-400 bg-gradient-to-r from-green-400/20 to-green-500/20`;
    } else if (selectedAnswerId === answer.id) {
      return `${baseClasses} border-red-400 bg-gradient-to-r from-red-400/20 to-red-500/20`;
    } else {
      return `${baseClasses} border-white/20 bg-white/5 opacity-60`;
    }
  };

  const modalTitle = (
    <div className="flex items-center gap-2">
      <HelpCircle size={20} className="mb-1" />
      <span>Quiz Question</span>
    </div>
  );

  const renderQuizComplete = () => {
    const selectedAnswer = question.answers.find((answer) => answer.id === selectedAnswerId);
    const isCorrect = selectedAnswer?.isCorrect || false;

    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <motion.div className="text-center space-y-8 max-w-lg w-full" variants={variants.container} initial="hidden" animate="visible">
          <motion.div variants={variants.item} className="relative">
            <motion.div
              className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-6 ${
                isCorrect ? "bg-gradient-to-r from-green-500 to-green-600" : "bg-gradient-to-r from-red-500 to-red-600"
              }`}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            >
              {isCorrect ? <Check size={48} className="text-white" /> : <X size={48} className="text-white" />}
            </motion.div>

            <motion.h2
              className={`text-4xl font-bold mb-6 ${isCorrect ? "text-green-300" : "text-red-300"}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              {isCorrect ? "Correct!" : "Incorrect!"}
            </motion.h2>

            {!isCorrect && (
              <motion.div
                className="inline-block px-8 py-4 bg-gradient-to-r from-book-primary-10 to-book-primary-20 rounded-xl border border-book-primary-30"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.6 }}
              >
                <p className="text-xl text-white/90">The correct answer was:</p>
                <p className="text-xl text-blue-300 font-semibold mt-2">{question.answers.find((a) => a.isCorrect)?.text}</p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </div>
    );
  };

  const renderQuestion = () => (
    <motion.div className="space-y-8 max-w-4xl mx-auto" variants={variants.container} initial="hidden" animate="visible">
      {/* Question */}
      <motion.div variants={variants.item} className="relative overflow-hidden rounded-xl border border-book-primary-20 bg-gradient-to-r from-book-primary-10 to-book-primary-20">
        <h2 className="text-2xl p-8 font-semibold text-white leading-relaxed">{question.question}</h2>
      </motion.div>

      {/* Answers Grid */}
      <motion.div variants={variants.item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {question.answers.map((answer, index) => (
          <motion.button
            key={answer.id}
            onClick={() => handleAnswerSelect(answer.id)}
            className={getAnswerButtonClasses(answer)}
            disabled={showResult}
            variants={variants.answerItem}
            initial={showResult ? false : "hidden"}
            animate="visible"
            transition={{ delay: showResult ? 0 : index * 0.15 }}
            whileHover={{
              scale: showResult ? 1 : 1.03,
              borderColor: showResult ? undefined : "rgba(255, 255, 255, 0.5)",
              backgroundColor: showResult ? undefined : "rgba(255, 255, 255, 0.1)",
            }}
            whileTap={{ scale: showResult ? 1 : 0.97 }}
            style={{
              borderColor: !showResult && selectedAnswerId === answer.id ? "rgb(96, 165, 250)" : undefined,
              backgroundColor: !showResult && selectedAnswerId === answer.id ? "rgba(59, 130, 246, 0.2)" : undefined,
              transform: !showResult && selectedAnswerId === answer.id ? "scale(1.02)" : undefined,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-white font-bold text-lg">{String.fromCharCode(65 + index)}</div>
                <span className="text-white font-medium text-lg">{answer.text}</span>
              </div>
              <div className="flex items-center">
                {showResult && answer.isCorrect && (
                  <motion.div
                    className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                  >
                    <Check size={20} className="text-white" />
                  </motion.div>
                )}
                {showResult && selectedAnswerId === answer.id && !answer.isCorrect && (
                  <motion.div
                    className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                  >
                    <X size={20} className="text-white" />
                  </motion.div>
                )}
              </div>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );

  return (
    <ModalUI title={modalTitle} onClose={onClose} size="lg">
      <motion.div className="flex flex-col h-full relative overflow-hidden p-4" variants={variants.container} initial="hidden" animate="visible" exit="exit">
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <div className="w-full">
            {showResult ? (
              <motion.div key="result" initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}>
                {renderQuizComplete()}
              </motion.div>
            ) : (
              <motion.div key="question" initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}>
                {renderQuestion()}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </ModalUI>
  );
};

const variants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut", staggerChildren: 0.15, delayChildren: 0.1 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.3 } },
  },
  item: { hidden: { opacity: 0, y: 30, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5 } } },
  answerItem: { hidden: { opacity: 0, scale: 0.9 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.4 } } },
};

export default QuizModal;
