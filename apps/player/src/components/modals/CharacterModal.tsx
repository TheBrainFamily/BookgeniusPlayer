import React, { useEffect, useMemo, useState } from "react";
import { motion, type Variants } from "motion/react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

import ModalUI from "./ModalUI";
import CharacterMedia from "@player/components/CharacterMedia";
import { type CharacterData } from "@player/types/book";
import { findCharacterSentences, type SearchResultItemData } from "@player/searchModal";
import { getSavedLocation, systemNavigateTo } from "@player/helpers/paragraphsNavigation";
import { useBookConvex } from "@player/context/BookConvexContext";
import { highlightSearchInParagraph } from "@player/utils/textHighlighting";
import { DialogEnhanceClose } from "../ui/dialog";
import { getChapterTitle } from "@player/utils/getChapterTitle";
import { resolveCharacterSnapshot } from "@player/utils/characterOverrides";
import { isVideoFile } from "@player/helpers/isVideoFile";
import { getAvatarSource } from "@player/helpers/svgAvatars";
import { useBottomInput } from "@player/stores/modals/bottomInput.store";
import { useSearchModal } from "@player/stores/modals/searchModal.store";
import { FILTER_OPTIONS } from "@player/utils/filterOptions";
import { useElementVisibilityStore } from "@player/stores/elementVisibility.store";

interface CharacterModalProps {
  onClose: () => void;
  isVideo: boolean;
  mediaSrc: string;
  characterSlug: string;
  endChapter: number;
  chapter?: number;
  paragraph?: number;
  isTalking?: boolean;
}

const findLatestSummaryInRange = (character: CharacterData, endChapter: number) =>
  character.infoPerChapter
    .filter((info) => info.chapter <= endChapter)
    .sort((a, b) => b.chapter - a.chapter)[0]?.summary ?? "";

const CharacterModal: React.FC<CharacterModalProps> = ({
  onClose,
  isVideo,
  mediaSrc,
  characterSlug,
  endChapter,
  chapter,
  paragraph,
  isTalking,
}) => {
  const { t } = useTranslation();

  const { setValue } = useBottomInput();
  const { openModal: openSearchModal, setLastClickedAppearanceId, setResults } = useSearchModal();
  const { pauseAllTimers, showAllElements } = useElementVisibilityStore();
  const { charactersData } = useBookConvex();

  const matchingCharacter = useMemo(
    () => charactersData.find((c) => c.slug === characterSlug),
    [characterSlug, charactersData],
  );
  const latestSummary = useMemo(
    () => (matchingCharacter ? findLatestSummaryInRange(matchingCharacter, endChapter) : ""),
    [matchingCharacter, endChapter],
  );

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
        ? resolveCharacterSnapshot(matchingCharacter, {
            location: locationRef,
            baseSummary: latestSummary,
            fallbackDisplayName: matchingCharacter.characterName,
          })
        : null,
    [matchingCharacter, locationRef, latestSummary],
  );

  const svgFallback = useMemo(
    () =>
      matchingCharacter
        ? getAvatarSource({
            slug: matchingCharacter.slug,
            characterName: matchingCharacter.characterName,
            bookSlug: "",
            infoPerChapter: [],
          })
        : null,
    [matchingCharacter],
  );

  // Use Convex URLs from snapshot - prefer listening unless explicitly talking
  // explicitAssetUrl is only for character overrides with explicit file paths
  const resolvedMediaSrc = useMemo(() => {
    if (!snapshot) return mediaSrc || svgFallback;
    // Check for explicit override asset first
    if (snapshot.media.explicitAssetUrl) return snapshot.media.explicitAssetUrl;
    // Use talking or listening based on state
    const url = isTalking ? snapshot.media.talking : snapshot.media.listening;
    return url || svgFallback;
  }, [snapshot, mediaSrc, isTalking, svgFallback]);
  const resolvedIsVideo = useMemo(
    () => (resolvedMediaSrc ? isVideoFile(resolvedMediaSrc) : isVideo),
    [resolvedMediaSrc, isVideo],
  );

  const [characterAppearances, setCharacterAppearances] = useState<SearchResultItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search for character appearances in the text up to the current location
  useEffect(() => {
    if (!matchingCharacter) return;

    const furthestLocation = getSavedLocation();
    setIsLoading(true);

    try {
      const searchResults = findCharacterSentences(characterSlug, furthestLocation, {
        mode: "spotlight",
        limit: 3,
      });
      setCharacterAppearances(searchResults.items);
    } catch (err) {
      console.error("Error searching for character appearances:", err);
      setCharacterAppearances([]);
    } finally {
      setIsLoading(false);
    }
  }, [matchingCharacter, characterSlug]);

  const handleAppearanceClick = (appearance: SearchResultItemData) => {
    void systemNavigateTo({
      currentChapter: appearance.chapter,
      currentParagraph: appearance.paragraphNumber,
    });

    if (matchingCharacter?.characterName) {
      highlightSearchInParagraph(
        appearance.chapter,
        appearance.paragraphNumber,
        matchingCharacter.characterName,
      );
    }
    const character = `@${matchingCharacter.characterName}`;
    setValue(character);
    const furthestLocation = getSavedLocation();
    setLastClickedAppearanceId(appearance.id);
    const searchResults = findCharacterSentences(characterSlug, furthestLocation, {
      mode: "chronological",
    });
    setResults(searchResults);
    openSearchModal(true, true, character);
    pauseAllTimers();
    showAllElements();
    onClose();
  };

  const handleOnClose = () => {
    onClose();
  };

  if (!matchingCharacter) return null;

  return (
    <ModalUI onClose={handleOnClose} className="bg-transparent" size="xxl" disableHeightConstraint>
      <motion.div
        className="flex flex-col sm:flex-row items-center sm:items-stretch gap-2 sm:gap-6 mx-auto relative"
        variants={variants.container}
        initial="hidden"
        animate="visible"
        exit="exit"
        onPointerUp={handleOnClose}
      >
        <motion.div
          className="w-48 sm:w-40 md:w-80 rounded-full overflow-hidden max-h-[30vh] max-w-[30vh] sm:max-h-[50vh] sm:max-w-[50vh] md:max-h-80 md:max-w-80 border shadow-xl border-book-primary-20 aspect-square flex-shrink-0 self-center"
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
            isTalking={isTalking}
          />
        </motion.div>

        <motion.div
          className="p-2 sm:p-4 rounded-xl flex flex-col gap-2 sm:gap-4 w-full max-w-2xl relative
          bg-black/70 textured-bg border border-white/30 shadow-xl text-white overflow-hidden min-h-0 flex-1"
          variants={variants.content}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-center gap-2">
            <h4 className="px-5 text-lg font-bold text-white">
              {snapshot?.displayName ?? matchingCharacter.characterName}
            </h4>
          </div>

          <div className="flex flex-col gap-3 px-1 min-h-0">
            <p
              className="text-center text-white/90 text-sm sm:text-base"
              dangerouslySetInnerHTML={{ __html: snapshot?.summary ?? latestSummary }}
            />

            {(isLoading || characterAppearances.length > 0) && (
              <motion.div
                className="mt flex flex-col gap-2 min-h-0"
                variants={variants.appearances}
              >
                <h5 className="text-sm sm:text-md font-semibold text-white mb-2 text-center">
                  {t("appearances")}
                </h5>

                {isLoading ? (
                  <motion.div
                    className="flex flex-col items-center justify-center py-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="relative">
                      <motion.div
                        className="w-8 h-8 border-3 rounded-full border-book-primary-30 border-t-book-primary"
                        variants={variants.loading}
                      />
                    </div>
                    <motion.div
                      className="mt-2 text-white/90 text-xs sm:text-sm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      {t("searching_appearances")}
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div className="p-1 flex flex-col min-h-0" variants={variants.container}>
                    <div className="overflow-y-auto pb-4 pr-1 space-y-3 max-h-[38vh] sm:max-h-[40vh]">
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
                          <div className="relative p-3">
                            <div className="flex gap-2 mb-2">
                              {appearance.type && (
                                <div className="px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium bg-book-tertiary-30 text-book-tertiary items-center">
                                  <span>
                                    {t(
                                      FILTER_OPTIONS.find(
                                        (option) =>
                                          option.id.toLowerCase() === appearance.type.toLowerCase(),
                                      )?.translationKey,
                                    ) ?? appearance.type}
                                  </span>
                                </div>
                              )}
                              <div className="px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium bg-book-primary-30 text-book-primary overflow-hidden">
                                <span className="flex items-center gap-1 min-w-0">
                                  <FileText size={12} className="flex-shrink-0" />
                                  <span className="line-clamp-1">
                                    {appearance.percentInChapter}% {t("of_chapter")}{" "}
                                    {getChapterTitle(appearance.chapter, t)}
                                  </span>
                                </span>
                              </div>
                            </div>

                            <motion.div
                              className="text-sm text-white/90 leading-relaxed line-clamp-6 md:line-clamp-3 whitespace-pre-wrap"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.2 }}
                              dangerouslySetInnerHTML={{ __html: appearance.summary }}
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
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.3, ease: "easeOut", staggerChildren: 0.1 },
    },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
  },
  media: {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
  },
  content: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut", delay: 0.1 } },
  },
  appearances: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.3, ease: "easeOut", delay: 0.2 } },
  },
  item: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
    hover: { scale: 0.98, transition: { duration: 0.2, ease: "easeInOut" } },
    tap: { scale: 0.95, transition: { duration: 0.1 } },
  },
  loading: {
    initial: { rotate: 0 },
    animate: { rotate: 360, transition: { duration: 1, ease: "linear", repeat: Infinity } },
  },
};

export default CharacterModal;
