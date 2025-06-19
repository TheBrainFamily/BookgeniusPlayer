import React, { useState } from "react";

import ModalUI from "./ModalUI";
import { findLowerSentenceScore } from "@/helpers/findLowerSentenceScore";

interface SentenceModalProps {
  onClose: () => void;
  sentenceId?: string;
  currentSentence?: string;
  lowerSentence?: string;
  lowerSentenceScore?: number;
}

const SentenceModal: React.FC<SentenceModalProps> = ({ onClose, currentSentence, lowerSentence, sentenceId, lowerSentenceScore }) => {
  const [current] = useState(currentSentence);
  const [lower, setLower] = useState(lowerSentence);
  const [score, setScore] = useState(lowerSentenceScore);
  const [isLowerText, setIsLowerText] = useState(true);

  const handleClick = () => {
    const { text, score: _score } = findLowerSentenceScore(sentenceId, score);

    if (!text) {
      setIsLowerText(false);
      return;
    }

    setLower(text);
    setScore(_score);
  };

  return (
    <ModalUI onClose={onClose}>
      <div className="space-y-2 mb-6">
        <div>
          <p className="text-green-500 font-bold">Your current reading sentence is:</p>
          <p>{current}</p>
        </div>
      </div>
      <div className="space-y-2 mb-6">
        <div>
          <p className="text-green-500 font-bold">One level lower sentence is:</p>
          <p>{lower}</p>
        </div>
      </div>
      {!isLowerText && (
        <div className="space-y-2 mb-6">
          <p className="text-red-500 font-bold">There is no lower sentence score.</p>
        </div>
      )}
      <button className="border px-4 py-1" onClick={handleClick}>
        Get Lower Sentence
      </button>
    </ModalUI>
  );
};

export default SentenceModal;
