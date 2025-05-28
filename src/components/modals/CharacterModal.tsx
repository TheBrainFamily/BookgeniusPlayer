import React, { useMemo } from "react";
import ModalUI from "./ModalUI";
import CharacterMedia from "@/components/CharacterMedia";
import { CharacterData } from "@/booksData/types";
import { performLocalDOMSearch } from "@/searchModal";
import { useLocation } from "@/state/LocationContext";

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
  const { location } = useLocation();

  // Search for character appearances in the text up to the current location
  const characterAppearances = useMemo(() => {
    const searchResults = performLocalDOMSearch(matchingCharacter.characterName, location);
    // Return first 3 appearances
    return searchResults.items.slice(0, 3);
  }, [matchingCharacter.characterName, location]);

  return (
    <ModalUI onClose={onClose} className="bg-transparent pointer-events-none">
      <div className="flex flex-col items-center pointer-events-none gap-6 max-w-4xl mx-auto">
        <div className="rounded-full overflow-hidden h-full w-full max-h-[60vh] max-w-[60vh] lg:max-h-96 lg:max-w-96 border shadow-xl border-white/30 aspect-square">
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

        <div className="p-4 rounded-xl bg-black/70 textured-bg border shadow-xl border-white/30 flex flex-col gap-4 w-full max-w-2xl pointer-events-auto">
          <div>
            <h4 className="text-lg font-bold text-center text-white mb-2">{matchingCharacter.characterName}</h4>
            <p className="text-center text-gray-200" dangerouslySetInnerHTML={{ __html: findLatestSummaryInRange(matchingCharacter, endChapter) || "" }} />
          </div>

          {characterAppearances.length > 0 && (
            <div className="mt-4">
              <h5 className="text-md font-semibold text-white mb-3 text-center">Wystąpienia postaci w tekście</h5>
              <div className="space-y-3">
                {characterAppearances.map((appearance) => (
                  <div key={appearance.id} className="p-3 rounded-lg bg-black/20 border border-white/20 hover:bg-black/40 transition-colors cursor-pointer">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-blue-300">
                        Rozdział {appearance.chapter}, Paragraf {appearance.paragraphNumber}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{appearance.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalUI>
  );
};

export default CharacterModal;
