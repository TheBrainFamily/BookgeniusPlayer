import { useEffect, useMemo } from "react";

import { useLocation } from "@/state/LocationContext";
import { useCurrentSpeakers } from "./useCurrentSpeakers";
import { getCharactersData } from "@/genericBookDataGetters/getCharactersData";
import { getBookData } from "@/genericBookDataGetters/getBookData";

function updateInlineAvatarTalkingState(container: HTMLDivElement, isTalking: boolean) {
  if (!container.dataset.hasVideos) return;

  const listeningVideo = container.querySelector('video[data-state="listens"]') as HTMLVideoElement;
  const speakingVideo = container.querySelector('video[data-state="speaks"]') as HTMLVideoElement;

  if (listeningVideo && speakingVideo) {
    // Update opacity to swap videos
    listeningVideo.style.opacity = isTalking ? "0" : "1";
    speakingVideo.style.opacity = isTalking ? "1" : "0";

    // Ensure videos are playing
    if (isTalking && speakingVideo.paused) {
      speakingVideo.play().catch((e) => console.warn("Speaking video play failed:", e));
    } else if (!isTalking && listeningVideo.paused) {
      listeningVideo.play().catch((e) => console.warn("Listening video play failed:", e));
    }
  }
}

export function usePlayCharacterSelect() {
  const { location } = useLocation();

  const bookData = useMemo(() => getBookData(), []);
  const allCharacters = useMemo(() => getCharactersData(), []);
  const isPlayFormat = useMemo(() => bookData.metadata.bookForm === "play", [bookData]);
  const bookSlug = useMemo(() => bookData.slug, [bookData]);

  const currentSpeakers = useCurrentSpeakers(location, allCharacters, isPlayFormat);

  useEffect(() => {
    if (!location) return;

    // Get the current paragraph first to identify which avatars should be speaking
    const currentChapterSelector = `section[data-chapter="${location.currentChapter}"]`;
    const currentParagraphSelector = `[data-index="${location.currentParagraph}"]`;
    const currentParagraph = document.querySelector(`${currentChapterSelector} ${currentParagraphSelector}`);
    const currentPlayRow = currentParagraph?.closest(".play-row") || currentParagraph;

    // Get ALL inline avatars in the entire chapter (not just current play row)
    const chapterInlineAvatars = document.querySelectorAll<HTMLDivElement>(`${currentChapterSelector} .play-row .inline-avatar`);

    if (!chapterInlineAvatars) return;

    chapterInlineAvatars.forEach((container) => {
      const slug = container.dataset.character;
      if (!slug) return;

      // Check if this avatar is in the current play row AND is a current speaker
      const isInCurrentPlayRow = currentPlayRow && currentPlayRow.contains(container);
      const isSpeaking = isInCurrentPlayRow && currentSpeakers.includes(slug);

      // Update the talking state
      updateInlineAvatarTalkingState(container, isSpeaking);

      // Also update the placeholder's dataset
      const placeholder = container.closest(".character-placeholder") as HTMLSpanElement;
      if (placeholder) {
        placeholder.dataset.isTalking = isSpeaking.toString();
      }
    });
  }, [currentSpeakers, location, allCharacters, bookSlug]);
}
