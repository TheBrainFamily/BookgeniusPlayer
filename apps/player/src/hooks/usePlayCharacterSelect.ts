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

  // Swap opacity
  const nextL = isTalking ? "0" : "1";
  const nextS = isTalking ? "1" : "0";

  if (listeningVideo.style.opacity !== nextL) listeningVideo.style.opacity = nextL;
  if (speakingVideo.style.opacity !== nextS) speakingVideo.style.opacity = nextS;

  // Keep the correct video playing
  const toPlay = isTalking ? speakingVideo : listeningVideo;
  if (toPlay.paused) {
    toPlay.play().catch((e) => console.warn("Video play failed:", e));
  }
}

export function usePlayCharacterSelect() {
  const { location } = useLocation();

  const bookData = useMemo(() => getBookData(), []);
  const allCharacters = useMemo(() => getCharactersData(), []);
  const isPlayFormat = useMemo(() => bookData.metadata.bookForm === "play", [bookData]);

  const currentSpeakers = useCurrentSpeakers(location, allCharacters, isPlayFormat);

  useEffect(() => {
    if (!isPlayFormat) return;
    if (!location) return;

    const chapterSelector = `section[data-chapter="${location.currentChapter}"]`;
    const paragraphSelector = `${chapterSelector} [data-index="${location.currentParagraph}"]`;

    const settleCharacter = () => {
      let currentPlayRow = document.querySelector(paragraphSelector)?.closest(".play-row");
      if (!currentPlayRow) {
        currentPlayRow = document.querySelector(`${chapterSelector} .active-paragraph`)?.closest(".play-row") || null;
      }

      const chapterEl = document.querySelector(chapterSelector);
      if (!chapterEl) return;

      const chapterInlineAvatars = chapterEl.querySelectorAll<HTMLDivElement>(".play-row .inline-avatar");
      chapterInlineAvatars.forEach((container) => {
        const slug = container.dataset.character;
        if (!slug) return;

        const isInCurrentPlayRow = !!currentPlayRow && currentPlayRow.contains(container);
        const isSpeaking = isInCurrentPlayRow && currentSpeakers.includes(slug);

        updateInlineAvatarTalkingState(container, isSpeaking);

        const placeholder = container.closest(".character-placeholder") as HTMLSpanElement | null;
        if (placeholder) placeholder.dataset.isTalking = String(isSpeaking);
      });
    };

    // Use rAF to ensure DOM is updated
    const raf = requestAnimationFrame(settleCharacter);
    return () => cancelAnimationFrame(raf);
  }, [isPlayFormat, location, location.currentChapter, location.currentParagraph, currentSpeakers]);
}
