import React, { useEffect, useState } from "react";
import { motion, Variants } from "motion/react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

import ModalUI from "./ModalUI";
import CharacterMedia from "@/components/CharacterMedia";
import { CharacterData } from "@/books/types";
import { findCharacterSentences, SearchResultItemData } from "@/searchModal";
import { useLocation } from "@/state/LocationContext";
import { systemNavigateTo } from "@/helpers/paragraphsNavigation";
import { getCharactersData } from "@/genericBookDataGetters/getCharactersData";

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
  const matchingCharacter = getCharactersData().find((character) => character.slug === characterSlug);

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
        const searchResults = findCharacterSentences(characterSlug, location);
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
  }, [matchingCharacter.characterName, location]);

  const handleAppearanceClick = (appearance: SearchResultItemData) => {
    console.log(`CharacterModal: Navigating to chapter ${appearance.chapter}, paragraph ${appearance.paragraphNumber}`);
    systemNavigateTo({ currentChapter: appearance.chapter, currentParagraph: appearance.paragraphNumber });
    onClose();
  };

  return (
    <ModalUI onClose={onClose} className="bg-transparent pointer-events-none">
      <motion.div
        className="flex flex-col items-center pointer-events-none gap-6 max-w-4xl mx-auto relative"
        variants={variants.container}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <motion.div
          className="rounded-full overflow-hidden h-full w-full max-h-[60vh] max-w-[60vh] lg:max-h-96 lg:max-w-96 border shadow-xl border-book-primary-20 aspect-square"
          variants={variants.media}
          initial="hidden"
          animate="visible"
        >
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
        </motion.div>

        <motion.div
          className="p-4 rounded-xl flex flex-col gap-4 w-full max-w-2xl pointer-events-auto relative overflow-hidden
          bg-black/70 textured-bg border border-white/30 shadow-xl text-white"
          variants={variants.content}
          initial="hidden"
          animate="visible"
        >
          <div className="relative">
            <div className="flex items-center justify-center gap-2 mb-2">
              <h4 className="text-lg font-bold text-center text-white">{matchingCharacter.characterName}</h4>
            </div>
            <p className="text-center text-white/90" dangerouslySetInnerHTML={{ __html: findLatestSummaryInRange(matchingCharacter, endChapter) || "" }} />
          </div>

          {characterAppearances.length > 0 && (
            <motion.div className="mt-4 relative" variants={variants.appearances} initial="hidden" animate="visible">
              <h5 className="text-md font-semibold text-white mb-3 text-center">{t("appearances")}</h5>
              {isLoading ? (
                <motion.div className="flex flex-col items-center justify-center py-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="relative">
                    <motion.div
                      className="w-8 h-8 border-3 rounded-full border-book-primary-30 border-t-book-primary"
                      variants={variants.loading}
                      initial="initial"
                      animate="animate"
                    />
                  </div>
                  <motion.div className="mt-2 text-white/90 text-sm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    {t("searching_appearances")}
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div className="space-y-3" variants={variants.container} initial="hidden" animate="visible">
                  {characterAppearances.map((appearance, index) => (
                    <motion.div
                      key={appearance.id}
                      className="group relative overflow-hidden cursor-pointer rounded-xl border border-book-primary-20"
                      variants={variants.item}
                      whileHover="hover"
                      whileTap="tap"
                      onClick={() => handleAppearanceClick(appearance)}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div className="relative p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="px-2 py-1 rounded-md text-xs font-medium bg-book-primary-30 text-book-primary">
                            <span className="flex items-center gap-1">
                              <FileText size={12} />
                              {t("chapter")} {appearance.chapter}
                            </span>
                          </div>
                          <div className="px-2 py-1 rounded-md text-xs font-medium bg-book-tertiary-30 text-book-tertiary">
                            {t("paragraph")} {appearance.paragraphNumber}
                          </div>
                        </div>

                        <motion.div className="text-sm text-white/90 leading-relaxed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                          {appearance.text}
                        </motion.div>

                        <motion.div
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                          initial={{ scale: 0, rotate: -90 }}
                          whileHover={{ scale: 1, rotate: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="w-2 h-2 rounded-full bg-book-primary" />
                        </motion.div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </ModalUI>
  );
};

const variants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut", staggerChildren: 0.1 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
  },
  media: { hidden: { opacity: 0, scale: 0.8, y: -20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } },
  content: { hidden: { opacity: 0, y: 20, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: "easeOut", delay: 0.1 } } },
  appearances: { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut", delay: 0.2 } } },
  item: {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
    hover: { scale: 0.98, transition: { duration: 0.2, ease: "easeInOut" } },
    tap: { scale: 0.95, transition: { duration: 0.1 } },
  },
  loading: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } } },
};

export default CharacterModal;
