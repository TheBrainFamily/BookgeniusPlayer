import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, Variants } from "motion/react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

import ModalUI from "./ModalUI";
import CharacterMedia from "@player/components/CharacterMedia";
import { CharacterData } from "@player/types/book";
import { findCharacterSentences, performCachedSearch, SearchResultItemData, SearchResultsData } from "@player/searchModal";
import { getSavedLocation, systemNavigateTo } from "@player/helpers/paragraphsNavigation";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { highlightSearchInParagraph } from "@player/utils/textHighlighting";
import { DialogEnhanceClose } from "../ui/dialog";
import { getChapterTitle } from "@player/utils/getChapterTitle";
import { useContentShift } from "@player/stores/contentShift.store";
import { resolveCharacterSnapshot } from "@player/utils/characterOverrides";
import { isVideoFile } from "@player/helpers/isVideoFile";
import { useBottomInput } from "@player/stores/modals/bottomInput.store";
import { useSearchModal } from "@player/stores/modals/searchModal.store";

interface CharacterModalProps {
  onClose: () => void;
  isVideo: boolean;
  mediaSrc: string;
  characterSlug: string;
  endChapter: number;
  chapter?: number;
  paragraph?: number;
}

const findLatestSummaryInRange = (character: CharacterData, endChapter: number) =>
  character.infoPerChapter.filter((info) => info.chapter <= endChapter).sort((a, b) => b.chapter - a.chapter)[0]?.summary ?? "";

const CharacterModal: React.FC<CharacterModalProps> = ({ onClose, isVideo, mediaSrc, characterSlug, endChapter, chapter, paragraph }) => {
  const { t } = useTranslation();

  const { setValue } = useBottomInput();
  const { setResults, openModal: openSearchModal } = useSearchModal();

  const matchingCharacter = useMemo(() => getCharactersData().find((c) => c.slug === characterSlug), [characterSlug]);
  const latestSummary = useMemo(() => (matchingCharacter ? findLatestSummaryInRange(matchingCharacter, endChapter) : ""), [matchingCharacter, endChapter]);

  const locationRef = useMemo(() => {
    if (typeof chapter === "number" && typeof paragraph === "number") {
      return { chapter, paragraph };
    }
    if (matchingCharacter) {
      return { chapter: endChapter, paragraph: Number.MAX_SAFE_INTEGER };
    }
    return null;
  }, [chapter, paragraph, matchingCharacter, endChapter]);

  const snapshot = useMemo(
    () =>
      matchingCharacter
        ? resolveCharacterSnapshot(matchingCharacter, { location: locationRef, baseSummary: latestSummary, fallbackDisplayName: matchingCharacter.characterName })
        : null,
    [matchingCharacter, locationRef, latestSummary],
  );

  const resolvedMediaSrc = snapshot?.media.listening ?? mediaSrc;
  const resolvedIsVideo = useMemo(() => (resolvedMediaSrc ? isVideoFile(resolvedMediaSrc) : isVideo), [resolvedMediaSrc, isVideo]);

  const [characterAppearances, setCharacterAppearances] = useState<SearchResultItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const shiftEnableRef = useRef(false);

  // Search for character appearances in the text up to the current location
  useEffect(() => {
    if (!matchingCharacter) return;

    const furthestLocation = getSavedLocation();
    setIsLoading(true);

    try {
      const searchResults = findCharacterSentences(characterSlug, furthestLocation);
      setResults(searchResults);

      // 1. Unique chapters (first appearance in each chapter)
      const byChapter = new Map<number, SearchResultItemData>();
      for (const item of searchResults.items) {
        if (!byChapter.has(item.chapter)) byChapter.set(item.chapter, item);
      }

      let results = Array.from(byChapter.values()).sort((a, b) => a.chapter - b.chapter);

      // 2. If we have less than 3 results, try to add more from the first chapter in results
      if (results.length < 3 && searchResults.items.length > results.length && results[0]) {
        const firstChapter = results[0].chapter;
        const firstChapterItems = searchResults.items.filter((i) => i.chapter === firstChapter).sort((a, b) => a.paragraphNumber - b.paragraphNumber);

        const needed = Math.min(3 - results.length, Math.max(0, firstChapterItems.length - 1));
        const extras = firstChapterItems.slice(1, 1 + needed);

        results = [results[0], ...extras, ...results.slice(1)];
      }

      setCharacterAppearances(results);
    } catch (err) {
      console.error("Error searching for character appearances:", err);
      setCharacterAppearances([]);
    } finally {
      setIsLoading(false);
    }
  }, [matchingCharacter, characterSlug]);

  const handleAppearanceClick = (appearance: SearchResultItemData) => {
    void systemNavigateTo({ currentChapter: appearance.chapter, currentParagraph: appearance.paragraphNumber });

    if (matchingCharacter?.characterName) {
      highlightSearchInParagraph(appearance.chapter, appearance.paragraphNumber, matchingCharacter.characterName);
    }
    setValue(characterSlug);
    openSearchModal(true, true, characterSlug);
    onClose();
  };

  const handleOnClose = () => {
    useContentShift.getState().disableContentShift();
    shiftEnableRef.current = false;
    onClose();
  };

  if (!matchingCharacter) return null;

  return (
    <ModalUI onClose={handleOnClose} className="bg-transparent" size="xxl">
      <motion.div
        className="flex flex-col sm:flex-row items-center gap-6 mx-auto relative max-h-screen"
        variants={variants.container}
        initial="hidden"
        animate="visible"
        exit="exit"
        onPointerUp={handleOnClose}
      >
        <motion.div
          className="w-48 md:w-80 rounded-full overflow-hidden max-h-[30vh] max-w-[30vh] md:max-h-80 md:max-w-80 border shadow-xl border-book-primary-20 aspect-square"
          variants={variants.media}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <CharacterMedia
            mediaSrc={resolvedMediaSrc}
            isVideo={resolvedIsVideo}
            canonicalName={matchingCharacter.slug}
            commonAttrs={{
              "data-original-src": resolvedMediaSrc,
              "data-character-name": snapshot?.displayName ?? matchingCharacter.characterName,
              "data-summary": snapshot?.summary ?? latestSummary,
              className: "w-full h-full object-cover",
            }}
          />
        </motion.div>

        <motion.div
          className="p-3 sm:p-4 rounded-xl flex flex-col gap-4 w-full max-w-2xl relative
          bg-black/70 textured-bg border border-white/30 shadow-xl text-white max-h-[60vh] sm:max-h-[80vh] overflow-hidden"
          variants={variants.content}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-center gap-2">
            <h4 className="px-5 text-lg font-bold text-white">{snapshot?.displayName ?? matchingCharacter.characterName}</h4>
          </div>

          <div className="overflow-y-hidden space-y-3 px-1">
            <p className="text-center text-white/90 text-sm sm:text-base" dangerouslySetInnerHTML={{ __html: snapshot?.summary ?? latestSummary }} />

            {(isLoading || characterAppearances.length > 0) && (
              <motion.div className="mt" variants={variants.appearances}>
                <h5 className="text-sm sm:text-md font-semibold text-white mb-2 text-center">{t("appearances")}</h5>

                {isLoading ? (
                  <motion.div className="flex flex-col items-center justify-center py-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="relative">
                      <motion.div className="w-8 h-8 border-3 rounded-full border-book-primary-30 border-t-book-primary" variants={variants.loading} />
                    </div>
                    <motion.div className="mt-2 text-white/90 text-xs sm:text-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                      {t("searching_appearances")}
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div className="p-1" variants={variants.container}>
                    <div className="flex-grow overflow-y-auto pb-4 space-y-3 max-h-[50vh]">
                      {characterAppearances.slice(0, 3).map((appearance, index) => (
                        <motion.div
                          key={appearance.id}
                          className="group relative overflow-hidden cursor-pointer rounded-xl border border-book-primary-20"
                          variants={variants.item}
                          transition={{ delay: index * 0.05 }}
                          whileHover="hover"
                          whileTap="tap"
                          onPointerUp={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAppearanceClick(appearance);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleAppearanceClick(appearance);
                            }
                          }}
                        >
                          <div className="relative p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium bg-book-primary-30 text-book-primary">
                                <span className="flex items-center gap-1">
                                  <FileText size={12} />
                                  {appearance.percentInChapter}% {t("of_chapter")} {getChapterTitle(appearance.chapter, t)}
                                </span>
                              </div>
                            </div>

                            <motion.div
                              className="text-sm text-white/90 leading-relaxed line-clamp-6 md:line-clamp-3 whitespace-pre-wrap"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.2 }}
                              dangerouslySetInnerHTML={{ __html: appearance.text }}
                            />

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
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>

          <DialogEnhanceClose
            className="absolute top-4 right-4 cursor-pointer"
            onPointerUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleOnClose();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleOnClose();
              }
            }}
          />
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
  media: { hidden: { opacity: 0, scale: 0.8 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } } },
  content: { hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut", delay: 0.1 } } },
  appearances: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.3, ease: "easeOut", delay: 0.2 } } },
  item: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
    hover: { scale: 0.98, transition: { duration: 0.2, ease: "easeInOut" } },
    tap: { scale: 0.95, transition: { duration: 0.1 } },
  },
  loading: { initial: { rotate: 0 }, animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } } },
};

export default CharacterModal;
