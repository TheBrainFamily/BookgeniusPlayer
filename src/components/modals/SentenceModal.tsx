import React, { useState } from "react";

import ModalUI from "./ModalUI";
import { findSimplifiedSentence } from "@/helpers/findSimplifiedSentence";
import { Button } from "@/components/ui/button";

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
  const [isMoreSimplifiedSentence, setIsMoreSimplifiedSentence] = useState(Boolean(simplifiedSentence));

  const handleClick = () => {
    if (!_simplifiedSentence) return;
    const { text, score: _score, hasLower } = findSimplifiedSentence(currentSentenceId, _simplifiedSentenceScore);

    if (text) {
      setSimplifiedSentence(text);
      setSimplifiedSentenceScore(_score);
    }
    setIsMoreSimplifiedSentence(hasLower);
  };

  return (
    <ModalUI onClose={onClose}>
      <div className="space-y-2 mb-6">
        <div>
          <p className="text-green-500 font-bold">Current Sentence:</p>
          <p>{_currentSentence}</p>
        </div>
      </div>
      {_simplifiedSentence && (
        <div className="space-y-2 mb-6">
          <div>
            <p className="text-green-500 font-bold">Simplified Sentence</p>
            <p>{_simplifiedSentence}</p>
          </div>
        </div>
      )}
      {!isMoreSimplifiedSentence && (
        <div className="space-y-2 mb-6">
          <p className="text-red-500 font-bold">There is no more simplified version of a current sentence.</p>
        </div>
      )}
      <Button className="border px-4 py-1 rounded-lg cursor-pointer" onClick={handleClick} disabled={!isMoreSimplifiedSentence}>
        Get Simplified Sentence
      </Button>
    </ModalUI>
  );
};

export default SentenceModal;
