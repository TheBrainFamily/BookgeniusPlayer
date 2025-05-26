import React from "react";
import ModalUI from "./ModalUI";
import CharacterMedia from "@/components/CharacterMedia";
import { CharacterData } from "@/booksData/types";

interface CharacterModalProps {
  onClose: () => void;
  isVideo: boolean;
  mediaSrc: string;
  matchingCharacter: CharacterData;
  endChapter: number;
}

export const findLatestSummaryInRange = (character: CharacterData, endChapter: number) => {
  const latestSummary = character.infoPerChapter.filter((info) => info.chapter <= endChapter).sort((a, b) => b.chapter - a.chapter)[0]?.summary;
  return latestSummary;
};

const CharacterModal: React.FC<CharacterModalProps> = ({ onClose, isVideo, mediaSrc, matchingCharacter, endChapter }) => {
  return (
    <ModalUI onClose={onClose} className="bg-transparent pointer-events-none">
      <div className="flex flex-col md:flex-row lg:flex-col gap-4 items-center pointer-events-none">
        <div className="rounded-full overflow-hidden h-full w-full max-h-[90vh] max-w-[90vh] lg:max-h-120 lg:max-w-120 border-4 border-[var(--entity-highlight-border-light)] aspect-square">
          <CharacterMedia
            mediaSrc={mediaSrc}
            isVideo={isVideo}
            canonicalName={matchingCharacter.slug}
            commonAttrs={{
              "data-original-src": mediaSrc,
              "data-character-name": matchingCharacter.characterName,
              "data-summary": findLatestSummaryInRange(matchingCharacter, endChapter),
              className: "w-full h-full object-cover",
            }}
          />
        </div>
        <div className="flex flex-col self-center p-4 rounded-lg bg-[var(--entity-highlight-bg-light)] border-2 border-[var(--entity-highlight-border-light)] max-w-2xl pointer-events-auto">
          <h4 className="italic font-bold text-center">{matchingCharacter.characterName}</h4>
          <p className="text-center" dangerouslySetInnerHTML={{ __html: findLatestSummaryInRange(matchingCharacter, endChapter) || "" }} />
        </div>
      </div>
    </ModalUI>
  );
};

export default CharacterModal;
