import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, Variants, useMotionValue, useSpring, useTransform } from "motion/react";
import { HelpCircle, Check, X, ChevronLeft, ChevronRight } from "lucide-react";

import ModalUI from "./ModalUI";
import { QuizAnswer, QuizQuestion } from "@/stores/modals/quizModal.store";

const AnimatedComplexityNumber: React.FC<{ value: number; isChanging: boolean }> = React.memo(({ value, isChanging }) => {
  const [currentDisplayValue, setCurrentDisplayValue] = useState(value);
  const motionValue = useMotionValue(currentDisplayValue);
  const spring = useSpring(motionValue, { stiffness: 50, damping: 15, mass: 1, restDelta: 0.001 });
  const rounded = useTransform(spring, (latest) => Math.round(latest));

  useEffect(() => {
    setCurrentDisplayValue(value);
    motionValue.set(value);
  }, [value, motionValue]);

  return <motion.span className={`font-bold transition-colors duration-300 ${isChanging ? "text-blue-300" : "text-white"}`}>{rounded}</motion.span>;
});

interface QuizModalProps {
  onClose: () => void;
  nextQuestion: () => void;
  previousQuestion: () => void;
  question: QuizQuestion;
  currentQuestionIndex: number;
  totalQuestions: number;
  sentence: string | null;
  setUserResponse: (questionId: string, answerId: string) => void;
}

const QuizModal: React.FC<QuizModalProps> = ({ onClose, question, nextQuestion, previousQuestion, currentQuestionIndex, totalQuestions, sentence, setUserResponse }) => {
  const { t } = useTranslation();
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [currentComplexity, setCurrentComplexity] = useState<number>(() => parseInt(localStorage.getItem("readingComplexity") || "50"));
  const [isComplexityChanging, setIsComplexityChanging] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const modalTitle = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
        <span className="text-sm sm:text-base">Quiz Question</span>
      </div>
    ),
    [],
  );

  useEffect(() => {
    setSelectedAnswerId(null);
    setShowResult(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, [question]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const getAnswerButtonClasses = useCallback(
    (answer: QuizAnswer) => {
      const baseClasses = "w-full p-2 sm:p-3 md:p-4 lg:p-6 text-left border-2 rounded-lg sm:rounded-xl cursor-pointer relative overflow-hidden shadow-lg";

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
    },
    [showResult, selectedAnswerId],
  );

  const handleAnswerCorrectness = useCallback(
    (answerId: string) => {
      const answerIsCorrect = Boolean(question.answers.find((answer) => answer.id === answerId && answer.isCorrect));

      let readingComplexity = parseInt(localStorage.getItem("readingComplexity") || "50");

      if (answerIsCorrect) {
        readingComplexity = Math.min(100, readingComplexity + 10);
      } else {
        readingComplexity = Math.max(0, readingComplexity - 10);
      }

      localStorage.setItem("readingComplexity", readingComplexity.toString());

      setIsComplexityChanging(true);
      setCurrentComplexity(readingComplexity);

      setTimeout(() => {
        setIsComplexityChanging(false);
      }, 1500);

      window.dispatchEvent(new CustomEvent("changeReadingComplexity", { detail: { complexity: readingComplexity } }));
    },
    [question.answers],
  );

  const handleAnswerSelect = useCallback(
    (answerId: string) => {
      if (showResult) return;
      setSelectedAnswerId(answerId);
      setShowResult(true);

      handleAnswerCorrectness(answerId);
      setUserResponse(question.id, answerId);

      timeoutRef.current = setTimeout(() => {
        nextQuestion();
      }, 3000);
    },
    [showResult, handleAnswerCorrectness, setUserResponse, question.id, nextQuestion],
  );

  const handleNextQuestion = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    nextQuestion();
  }, [nextQuestion]);

  const handlePreviousQuestion = useCallback(() => {
    if (showResult) return;
    previousQuestion();
  }, [showResult, previousQuestion]);

  const selectedAnswerData = useMemo(() => {
    const selectedAnswer = question.answers.find((answer) => answer.id === selectedAnswerId);
    return { selectedAnswer, isCorrect: selectedAnswer?.isCorrect || false, correctAnswer: question.answers.find((a) => a.isCorrect) };
  }, [question.answers, selectedAnswerId]);

  const renderQuizComplete = useCallback(() => {
    const { isCorrect, correctAnswer } = selectedAnswerData;

    return (
      <div className="flex items-center justify-center min-h-[200px] sm:min-h-[300px] md:min-h-[350px] lg:min-h-[400px] px-3 sm:px-4">
        <motion.div className="text-center space-y-3 sm:space-y-4 md:space-y-6 lg:space-y-8 max-w-lg w-full" variants={variants.container} initial="hidden" animate="visible">
          <motion.div variants={variants.item} className="relative">
            <motion.div
              className={`inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 rounded-full mb-3 sm:mb-4 lg:mb-6 ${
                isCorrect ? "bg-gradient-to-r from-green-500 to-green-600" : "bg-gradient-to-r from-red-500 to-red-600"
              }`}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            >
              {isCorrect ? <Check className="text-white w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" /> : <X className="text-white w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10" />}
            </motion.div>

            <motion.h2
              className={`text-xl sm:text-2xl lg:text-3xl font-bold mb-3 sm:mb-4 lg:mb-6 ${isCorrect ? "text-green-300" : "text-red-300"}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              {isCorrect ? "Correct!" : "Incorrect!"}
            </motion.h2>

            {!isCorrect && correctAnswer && (
              <motion.div
                className="inline-block px-3 sm:px-4 lg:px-6 py-2 sm:py-3 bg-gradient-to-r from-book-primary-10 to-book-primary-20 rounded-lg sm:rounded-xl border border-book-primary-30"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.6 }}
              >
                <p className="text-xs sm:text-sm lg:text-base text-white/90">The correct answer was:</p>
                <p className="text-xs sm:text-sm lg:text-base text-blue-300 font-semibold mt-1">{correctAnswer.text}</p>
              </motion.div>
            )}
          </motion.div>

          <motion.div variants={variants.item}>
            <button
              onClick={handleNextQuestion}
              className="mt-3 sm:mt-4 px-4 sm:px-6 lg:px-8 py-2 sm:py-3 bg-blue-500 hover:bg-blue-600 transition-colors text-white rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm lg:text-base shadow-lg"
            >
              {currentQuestionIndex < totalQuestions - 1 ? "Next Question" : "Finish Quiz"}
            </button>
          </motion.div>
        </motion.div>
      </div>
    );
  }, [selectedAnswerData, handleNextQuestion, currentQuestionIndex, totalQuestions]);

  const renderQuestion = useCallback(
    () => (
      <motion.div className="space-y-3 sm:space-y-4 md:space-y-6 lg:space-y-8 max-w-4xl mx-auto" variants={variants.container} initial="hidden" animate="visible">
        {/* Question */}
        <motion.div
          variants={variants.item}
          className="relative overflow-hidden rounded-lg sm:rounded-xl border border-book-primary-20 bg-gradient-to-r from-book-primary-10 to-book-primary-20"
        >
          <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl p-3 sm:p-4 md:p-6 lg:p-8 font-semibold text-white leading-relaxed">{question.question}</h2>
        </motion.div>

        {/* Sentence - Hidden on mobile, visible on sm+ */}
        {sentence && (
          <motion.div variants={variants.item} className="hidden sm:block relative overflow-hidden rounded-lg sm:rounded-xl border border-white/10 bg-black/20">
            <p className="text-sm sm:text-base lg:text-lg p-3 sm:p-4 lg:p-6 text-white/80 leading-relaxed italic text-center">"{sentence}"</p>
          </motion.div>
        )}

        {/* Answers Grid */}
        <motion.div variants={variants.item} className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 md:gap-4 lg:gap-6">
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
                <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                  <div className="min-w-6 min-h-6 w-6 h-6 sm:min-w-8 sm:min-h-8 sm:w-8 sm:h-8 md:min-w-10 md:min-h-10 md:w-10 md:h-10 bg-white/20 rounded-lg flex items-center justify-center text-white font-bold text-xs sm:text-sm md:text-base">
                    {String.fromCharCode(65 + index)}
                  </div>
                  <span className="text-white font-medium text-xs sm:text-sm md:text-base lg:text-lg">{answer.text}</span>
                </div>
                <div className="flex items-center">
                  {showResult && answer.isCorrect && (
                    <motion.div
                      className="w-6 h-6 sm:w-8 sm:h-8 bg-green-500 rounded-full flex items-center justify-center"
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ duration: 0.4, delay: 0.2 }}
                    >
                      <Check size={16} className="text-white sm:w-5 sm:h-5" />
                    </motion.div>
                  )}
                  {showResult && selectedAnswerId === answer.id && !answer.isCorrect && (
                    <motion.div
                      className="w-6 h-6 sm:w-8 sm:h-8 bg-red-500 rounded-full flex items-center justify-center"
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ duration: 0.4, delay: 0.2 }}
                    >
                      <X size={16} className="text-white sm:w-5 sm:h-5" />
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      </motion.div>
    ),
    [question.question, question.answers, sentence, showResult, selectedAnswerId, handleAnswerSelect, getAnswerButtonClasses],
  );

  return (
    <ModalUI title={modalTitle} onClose={onClose} size="xxl" animateHeight={true}>
      <motion.div className="flex flex-col h-full relative overflow-hidden p-2 sm:p-4" variants={variants.container} initial="hidden" animate="visible" exit="exit">
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

        <div className="flex flex-col gap-3 sm:gap-4 mt-6 sm:mt-8 md:mt-10">
          <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-white/70 font-mono">
            <button onClick={handlePreviousQuestion} disabled={currentQuestionIndex === 0 || showResult} className="disabled:opacity-50 transition-opacity p-1">
              <ChevronLeft size={16} className="sm:w-5 sm:h-5" />
            </button>
            <span className="px-2">
              {currentQuestionIndex + 1} / {totalQuestions}
            </span>
            <button onClick={handleNextQuestion} disabled={currentQuestionIndex === totalQuestions - 1 || showResult} className="disabled:opacity-50 transition-opacity p-1">
              <ChevronRight size={16} className="sm:w-5 sm:h-5" />
            </button>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <motion.div
              className="bg-blue-400 h-1.5 rounded-full"
              initial={{ width: `${(currentQuestionIndex / totalQuestions) * 100}%` }}
              animate={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </div>

          <motion.div
            className={`hidden sm:flex items-center justify-center gap-3 text-sm rounded-lg px-4 py-3 transition-all duration-300 ${
              isComplexityChanging ? "bg-blue-500/10 border border-blue-400/30 shadow-lg shadow-blue-500/20" : "bg-black/20 border border-white/10"
            }`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <span className="text-white/80 font-medium">{t("reading_complexity")}:</span>
            <AnimatedComplexityNumber value={currentComplexity} isChanging={isComplexityChanging} />
          </motion.div>
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
