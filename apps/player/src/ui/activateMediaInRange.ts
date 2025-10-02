import { isVideoFile } from "@player/helpers/isVideoFile";
import { CharacterModalParams } from "@player/stores/modals/characterModal.store";
import { getPlaceholderFromVideoUrl } from "@player/utils/getPlaceholderFromVideoUrl";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { resolveCharacterSnapshot } from "@player/utils/characterOverrides";
import { isMobile } from "@player/utils/isMobileOrTablet";
import type { CharacterData } from "@player/types/book";
import type { CharacterSnapshot } from "@player/utils/characterOverrides";
import { normalizeSrcForInlineAvatar, highlightCharacter } from "./highlightCharacter";

// Global flag to ensure we reset all isTalking values only once at the very beginning
let hasInitializedTalkingStates = false;

let charactersBySlugCache: Map<string, CharacterData> | null = null;
function getCharactersBySlug() {
  if (!charactersBySlugCache) {
    charactersBySlugCache = new Map<string, CharacterData>();
    getCharactersData().forEach((c) => charactersBySlugCache!.set(c.slug, c));
  }

  return charactersBySlugCache;
}

function createVideoElement(src: string, state: "listens" | "speaks"): HTMLVideoElement {
  const video = document.createElement("video");
  video.src = src;
  video.classList.add("absolute", "top-0", "left-0", "w-full", "h-full", "object-cover", "rounded-full", "transition-opacity", "duration-300", "ease-in-out");
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.dataset.state = state;

  video.onerror = () => {
    console.warn(`Failed to load ${state} video: ${src}`);
    video.style.display = "none";
  };
  video.play().catch((e) => console.warn("Video play interrupted or failed:", e));

  return video;
}

/** Checks if a given chapter and paragraph index falls within the specified range **/
function isInRange(currentChapter: number, currentParagraph: number, startChapter: number, startParagraph: number, endChapter: number, endParagraph: number): boolean {
  // Single chapter range
  if (startChapter === endChapter) {
    return currentChapter === startChapter && currentParagraph >= startParagraph && currentParagraph <= endParagraph;
  }

  // Multi-chapter range
  if (currentChapter === startChapter && currentParagraph >= startParagraph) {
    return true; // In the first chapter, at or after the start paragraph
  }
  if (currentChapter > startChapter && currentChapter < endChapter) {
    return true; // In a middle chapter
  }
  if (currentChapter === endChapter && currentParagraph <= endParagraph) {
    return true; // In the last chapter, at or before the end paragraph
  }

  return false;
}

/** Creates a media container element with CharacterMedia-like structure for inline avatars */
function createMediaElement(
  placeholder: HTMLSpanElement,
  characterData: CharacterData | undefined,
  location: { chapter: number; paragraph: number } | null,
  snapshotOverride?: CharacterSnapshot | null,
): HTMLDivElement | null {
  const characterSlug = placeholder.dataset.character;
  if (!characterSlug || !characterData) return null;

  const snapshot = snapshotOverride ?? resolveCharacterSnapshot(characterData, { location, fallbackDisplayName: characterData.characterName });

  const listeningSrc = snapshot.media.listening;
  const talkingSrc = snapshot.media.talking;

  // Create container element similar to CharacterMedia structure
  const container = document.createElement("div");
  container.classList.add("inline-avatar", "relative", "w-full", "h-full");
  container.dataset.character = characterSlug;
  container.title = snapshot.displayName;

  // Create placeholder image (always shown as fallback)
  const placeholderImg = document.createElement("img");
  const placeholderSrc = getPlaceholderFromVideoUrl(listeningSrc || talkingSrc || "");
  placeholderImg.src = normalizeSrcForInlineAvatar(placeholderSrc);
  placeholderImg.classList.add("absolute", "top-0", "left-0", "w-full", "h-full", "object-cover", "rounded-full");
  placeholderImg.alt = snapshot.displayName;
  container.appendChild(placeholderImg);

  return container;
}

function createDummyElement(characterPlaceholder: HTMLSpanElement) {
  const dummyElement = document.createElement("span");
  dummyElement.classList.add("dummy-avatar-placeholder", "inline-avatar");
  const img = characterPlaceholder.querySelector<HTMLImageElement>("img");
  if (img) {
    dummyElement.appendChild(img.cloneNode(true));
  }
  return dummyElement;
}

const activatedMedia = new Map<string, Element>();
const activatedCharacterHighlighted = new Map<string, Element>();

/** Manages media loading and playback for paragraphs within the visible range **/
export function activateMediaInRange(
  startChapter: number,
  startParagraph: number,
  endChapter: number,
  endParagraph: number,
  openCharacterDetailsModal: (params: CharacterModalParams) => void,
  isPlayFormat: boolean,
  shouldCreateVideos: boolean,
) {
  if (!hasInitializedTalkingStates) {
    // Move initialization of click handler outside of this function - will help reducing passing dependencies (openCharacterDetailsModal)
    playRowCharacterClickInit(openCharacterDetailsModal);
    hasInitializedTalkingStates = true;
  }

  const charactersBySlug = getCharactersBySlug();

  const paragraphs = document.querySelectorAll<HTMLElement>(
    `.content-container section[data-chapter="${startChapter}"] [data-index], section[data-chapter="${endChapter}"] [data-index]`,
  );

  const bufferSize = isPlayFormat ? -4 : 10;

  const paragraphsInRange = Array.from(paragraphs).filter((paragraph) => {
    const chapterElement = paragraph.closest("section[data-chapter]") as HTMLElement;
    const chapterStr = chapterElement?.dataset.chapter;
    const paragraphStr = paragraph.dataset.index;

    if (chapterStr && paragraphStr) {
      const currentChapter = parseInt(chapterStr, 10);
      const currentParagraph = parseInt(paragraphStr, 10);
      return isInRange(currentChapter, currentParagraph, startChapter, startParagraph - bufferSize, endChapter, endParagraph + bufferSize);
    }
  });

  const playRows = [];

  paragraphsInRange.forEach((p) => {
    const charactersToHighlight = p.querySelectorAll<HTMLSpanElement>(".character-highlighted");

    Array.from(charactersToHighlight).forEach((character) => {
      const chapter = character.closest("[data-chapter]")?.getAttribute("data-chapter");
      const paragraph = character.closest("[data-index]")?.getAttribute("data-index");
      const index = `${character.dataset.character}-${chapter}-${paragraph}`;
      if (activatedCharacterHighlighted.has(index)) return;
      activatedCharacterHighlighted.set(index, character);
      highlightCharacter(character);
    });

    playRows.push(p.closest(".play-row") ?? (p as HTMLElement));
  });

  const uniquePlayRows = [...new Set(playRows)];

  uniquePlayRows.forEach((playRow: HTMLElement) => {
    const characterPlaceholder = playRow.querySelector<HTMLSpanElement>(".character-placeholder");

    if (!characterPlaceholder) return;

    const characterSlug = characterPlaceholder.dataset.character;

    if (!characterSlug.trim()) return;

    // needed for indexing the play row in activatedMedia Map
    const characterText = playRow.querySelector(".character-text");

    const firstParagraphIndex = characterText?.firstElementChild?.getAttribute("data-index");
    const lastParagraphIndex = characterText?.lastElementChild?.getAttribute("data-index");

    if (!firstParagraphIndex && !lastParagraphIndex) {
      console.warn(`Could not generate a unique index for character row: ${characterSlug}`);
      return;
    }

    const index = `${characterSlug}-${firstParagraphIndex}-${lastParagraphIndex}`;

    const locationForPlaceholder = { chapter: startChapter, paragraph: startParagraph };
    const characterData = charactersBySlug.get(characterSlug);
    const snapshot = characterData ? resolveCharacterSnapshot(characterData, { location: locationForPlaceholder, fallbackDisplayName: characterData.characterName }) : null;
    const dummyPlaceholder = characterPlaceholder.querySelector<HTMLSpanElement>(".dummy-avatar-placeholder");

    if (shouldCreateVideos && snapshot && !isMobile) {
      // Searching for the active paragraph within the current play row
      const activeParagraph = document.querySelector<HTMLElement>(`.active-paragraph`);
      const activePlayRow = activeParagraph?.closest(".play-row");

      const isTalking = activePlayRow === playRow;
      const desiredState = isTalking ? "speaks" : "listens";
      const videoSrc = isTalking ? snapshot.media.talking : snapshot.media.listening;

      const inlineAvatar = characterPlaceholder.querySelector(".inline-avatar");
      const existingVideo = inlineAvatar?.querySelector("video");

      if (existingVideo) {
        const currentState = existingVideo.dataset.state;
        // Normalize URLs for comparison
        const currentSrcNormalized = existingVideo.src.split("/").pop() || "";
        const videoSrcNormalized = videoSrc?.split("/").pop() || "";

        // Only update if state or source needs to change
        if (currentState !== desiredState || currentSrcNormalized !== videoSrcNormalized) {
          if (videoSrc && isVideoFile(videoSrc)) {
            existingVideo.src = videoSrc;
            existingVideo.dataset.state = desiredState;
            existingVideo.play().catch((e) => console.warn("Video play failed:", e));
          }
        }
        // If state and source match - do nothing, let it continue playing
      } else if (videoSrc && isVideoFile(videoSrc)) {
        const video = createVideoElement(videoSrc, desiredState);
        inlineAvatar?.appendChild(video);
      }
    }

    if (activatedMedia.has(index)) return;

    const newMediaElement = createMediaElement(characterPlaceholder, characterData, locationForPlaceholder, snapshot);

    if (newMediaElement) {
      const existingInlineAvatar = characterPlaceholder.querySelector(".inline-avatar");
      if (!existingInlineAvatar) {
        if (dummyPlaceholder) {
          characterPlaceholder.replaceChild(newMediaElement, dummyPlaceholder);
        } else {
          characterPlaceholder.appendChild(newMediaElement);
        }
        characterPlaceholder.dataset.mediaInjected = "true";
      }
    }

    activatedMedia.set(index, playRow);
  });

  // Here we clean up the activated media
  activatedMedia.forEach((playRow, index) => {
    if (!uniquePlayRows.includes(playRow as HTMLElement)) {
      const characterPlaceholder = playRow.querySelector<HTMLSpanElement>(".character-placeholder");

      if (characterPlaceholder) {
        const dummyElement = createDummyElement(characterPlaceholder);

        characterPlaceholder.replaceChildren(dummyElement);
      }

      activatedMedia.delete(index);
    }
  });
}

export const playRowCharacterClickInit = (openCharacterDetailsModal: (params: CharacterModalParams) => void) => {
  const contentContainer = document.querySelector("#content-container");
  if (!contentContainer) return;

  const charactersBySlug = getCharactersBySlug();

  contentContainer.addEventListener("pointerup", (e) => {
    if (e.metaKey || e.ctrlKey) return;

    const target = e.target as HTMLElement;

    const isStrongTag = target.tagName === "STRONG";
    const isInlineAvatar = target.closest(".inline-avatar");
    const isCharacterHighlighted = target.classList.contains("character-highlighted-activated");

    if (!isStrongTag && !isInlineAvatar && !isCharacterHighlighted) return;

    e.preventDefault();
    e.stopPropagation();

    const playRow = target.closest(".play-row");

    if (!playRow) return;

    const characterPlaceholder = playRow.querySelector<HTMLSpanElement>(".character-placeholder");
    const playRowCharacter = playRow.querySelector<HTMLElement>("[data-is-character='true']");

    if (!playRowCharacter || !characterPlaceholder) return;

    const currentChapterStr = playRow.closest("[data-chapter]")?.getAttribute("data-chapter");
    const currentParagraphStr = playRow.querySelector("[data-index]")?.getAttribute("data-index");

    const currentChapterInt = parseInt(currentChapterStr, 10);
    const currentParagraphInt = parseInt(currentParagraphStr, 10);

    if (isNaN(currentChapterInt) || isNaN(currentParagraphInt)) return;

    const characterSlug = isCharacterHighlighted ? target.dataset.character : characterPlaceholder.dataset.character;

    if (!characterSlug.trim()) return;

    const isTalking = characterPlaceholder?.dataset.isTalking === "true";

    const characterData = charactersBySlug.get(characterSlug);
    const snapshot = characterData
      ? resolveCharacterSnapshot(characterData, { location: { chapter: currentChapterInt, paragraph: currentParagraphInt }, fallbackDisplayName: characterData.characterName })
      : null;

    const mediaSrc = snapshot ? (isTalking ? snapshot.media.talking : snapshot.media.listening) : "";

    openCharacterDetailsModal({
      characterSlug,
      isVideo: !!mediaSrc && isVideoFile(mediaSrc),
      mediaSrc: mediaSrc || "",
      chapter: currentChapterInt,
      paragraph: currentParagraphInt,
    });
  });
};
