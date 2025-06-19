import React, { useState } from "react";

import ModalUI from "./ModalUI";
import { findSimplifiedSentence } from "@/helpers/findSimplifiedSentence";

interface SentenceModalProps {
  onClose: () => void;
  currentSentenceId?: string;
  currentSentence?: string;
  simplifiedSentence?: string;
  simplifiedSentenceScore?: number;
}

const SentenceModal: React.FC<SentenceModalProps> = ({ onClose, currentSentenceId, currentSentence, simplifiedSentence, simplifiedSentenceScore }) => {
  const [_currentSentence] = useState(currentSentence);
  const [_simplifiedSentence, setSimplifiedSentence] = useState(simplifiedSentence);
  const [_simplifiedSentenceScore, setSimplifiedSentenceScore] = useState(simplifiedSentenceScore);
  const [isMoreSimplifiedSentence, setIsMoreSimplifiedSentence] = useState(true);

  const handleClick = () => {
    const { text, score: _score } = findSimplifiedSentence(currentSentenceId, _simplifiedSentenceScore);

    if (!text) {
      setIsMoreSimplifiedSentence(false);
      return;
    }

    setSimplifiedSentence(text);
    setSimplifiedSentenceScore(_score);
  };

  return (
    <ModalUI onClose={onClose}>
      <div className="space-y-2 mb-6">
        <div>
          <p className="text-green-500 font-bold">Current Sentence:</p>
          <p>{_currentSentence}</p>
        </div>
      </div>
      <div className="space-y-2 mb-6">
        <div>
          <p className="text-green-500 font-bold">Simplified Sentence</p>
          <p>{_simplifiedSentence}</p>
        </div>
      </div>
      {!isMoreSimplifiedSentence && (
        <div className="space-y-2 mb-6">
          <p className="text-red-500 font-bold">There is no lower sentence score.</p>
        </div>
      )}
      <button className="border px-4 py-1" onClick={handleClick}>
        Get Simplified Sentence
      </button>
    </ModalUI>
  );
};

export default SentenceModal;
