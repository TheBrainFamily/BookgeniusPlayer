import React, { useEffect, useState } from "react";
import ModalUI from "./ModalUI";
import CharacterMedia from "@/components/CharacterMedia";
import { CharacterData } from "@/booksData/types";
import { findCharacterSentences, SearchResultItemData } from "@/searchModal";
import { useLocation } from "@/state/LocationContext";
import { getBookData } from "@/booksData/getBookData";
import { useTranslation } from "react-i18next";

interface CharacterModalProps {
  onClose: () => void;
  isVideo: boolean;
  mediaSrc: string;
  characterSlug: string;
  endChapter: number;
}

export const findLatestSummaryInRange = (character: CharacterData, endChapter: number) => {
  const latestSummary = character.infoPerChapter.filter((info) => info.chapter <= endChapter).sort((a, b) => b.chapter - a.chapter)[0]?.summary;
  return latestSummary;
};

const CharacterModal: React.FC<CharacterModalProps> = ({ onClose, isVideo, mediaSrc, characterSlug, endChapter }) => {
  const { location } = useLocation();
  const bookData = getBookData();
  const matchingCharacter = bookData.charactersData.find((character) => character.slug === characterSlug);

  // If character not found, don't render anything
  if (!matchingCharacter) {
    return null;
  }
  const [characterAppearances, setCharacterAppearances] = useState<SearchResultItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslation();

  // Search for character appearances in the text up to the current location
  useEffect(() => {
    const searchAppearances = () => {
      setIsLoading(true);
      try {
        const searchResults = findCharacterSentences(characterSlug, location, bookData);
        // Return first 3 appearances
        setCharacterAppearances(searchResults.items.slice(0, 3));
      } catch (error) {
        console.error("Error searching for character appearances:", error);
        setCharacterAppearances([]);
      } finally {
        setIsLoading(false);
      }
    };

    searchAppearances();
  }, [matchingCharacter.characterName, location, bookData.slug]);

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
              <h5 className="text-md font-semibold text-white mb-3 text-center">{t("appearances")}</h5>
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="text-gray-300">{t("searching_appearances")}</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {characterAppearances.map((appearance) => (
                    <div key={appearance.id} className="p-3 rounded-lg bg-black/20 border border-white/20 hover:bg-black/40 transition-colors cursor-pointer">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-blue-300">
                          {t("chapter")} {appearance.chapter}, {t("paragraph")} {appearance.paragraphNumber}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">{appearance.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalUI>
  );
};

export default CharacterModal;
