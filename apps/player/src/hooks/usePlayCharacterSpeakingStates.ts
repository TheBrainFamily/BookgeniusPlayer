import { useEffect, useMemo } from "react";

import { useLocation } from "@player/state/LocationContext";
import { useCurrentSpeakers } from "./useCurrentSpeakers";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { getBookData } from "@player/genericBookDataGetters/getBookData";

function updateInlineAvatarTalkingState(container: HTMLDivElement, isTalking: boolean) {
  const hasVideos = container.dataset.hasVideos === "true";
  if (!hasVideos) return;

  const listeningVideo = container.querySelector('video[data-state="listens"]') as HTMLVideoElement;
  const speakingVideo = container.querySelector('video[data-state="speaks"]') as HTMLVideoElement;

  if (!listeningVideo || !speakingVideo) return;

  const activeVideo = isTalking ? speakingVideo : listeningVideo;
  const inactiveVideo = isTalking ? listeningVideo : speakingVideo;
  const activeOpacity = "1";
  const inactiveOpacity = "0";

  if (activeVideo.style.opacity !== activeOpacity) {
    activeVideo.style.opacity = activeOpacity;
  }
  if (inactiveVideo.style.opacity !== inactiveOpacity) {
    inactiveVideo.style.opacity = inactiveOpacity;
  }

  // play active, pause inactive
  if (activeVideo.paused) {
    activeVideo.play().catch((e) => {
      console.warn("Failed to play active video:", e);
    });
  }

  if (!inactiveVideo.paused) {
    inactiveVideo.pause();
  }
}

export function usePlayCharacterSpeakingStates() {
  const { location } = useLocation();

  const bookData = useMemo(() => getBookData(), []);
  const allCharacters = useMemo(() => getCharactersData(), []);
  const isPlayFormat = useMemo(() => bookData.metadata.bookForm === "play", [bookData]);

  const currentSpeakers = useCurrentSpeakers(location, allCharacters, isPlayFormat);

  useEffect(() => {
    if (!isPlayFormat || !location) return;

    const chapterSelector = `section[data-chapter="${location.currentChapter}"]`;
    const paragraphSelector = `${chapterSelector} [data-index="${location.currentParagraph}"]`;

    const settleCharacter = () => {
      // Find current play row with fallback logic
      let currentPlayRow = document.querySelector(paragraphSelector)?.closest(".play-row");
      if (!currentPlayRow) {
        currentPlayRow = document.querySelector(`${chapterSelector} .active-paragraph`)?.closest(".play-row") || null;
      }

      const chapterEl = document.querySelector(chapterSelector);
      if (!chapterEl) return;

      const chapterInlineAvatars = chapterEl.querySelectorAll<HTMLDivElement>(".play-row .inline-avatar[data-character]");

      chapterInlineAvatars.forEach((container) => {
        const slug = container.dataset.character;
        if (!slug) return;

        const isInCurrentPlayRow = !!currentPlayRow && currentPlayRow.contains(container);
        const isSpeaking = isInCurrentPlayRow && currentSpeakers.includes(slug);

        // prevent one failing avatar from breaking others
        try {
          updateInlineAvatarTalkingState(container, isSpeaking);

          const placeholder = container.closest(".character-placeholder") as HTMLSpanElement | null;
          if (placeholder) {
            placeholder.dataset.isTalking = String(isSpeaking);
          }
        } catch (error) {
          console.warn(`Failed to update avatar state for character ${slug}:`, error);
        }
      });
    };

    const rafId = requestAnimationFrame(settleCharacter);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlayFormat, location?.currentChapter, location?.currentParagraph, currentSpeakers]);
}
