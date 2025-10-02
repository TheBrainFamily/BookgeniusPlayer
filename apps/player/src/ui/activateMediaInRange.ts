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

/** Lightweight <video> factory with sane defaults (autoplay/muted/loop/inline) */
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

/** Derives chapter and paragraph range for both play and non-play paragraphs */
function getRowContext(el: HTMLElement): { chapter: number | null; firstParagraphIndex: number | null; lastParagraphIndex: number | null } {
  const section = el.closest<HTMLElement>("[data-chapter]");
  const chapter = section ? parseInt(section.dataset.chapter || "", 10) : null;

  // play format: paragraphs are grouped under .character-text with multiple [data-index]
  const characterText = el.querySelector?.(".character-text") as HTMLElement | null;

  // Try to read indexes from play structure first; fall back to self/first child with [data-index]
  const firstParagraphIndex =
    characterText?.firstElementChild?.getAttribute("data-index") ??
    el.getAttribute?.("data-index") ??
    el.querySelector?.<HTMLElement>("[data-index]")?.getAttribute("data-index") ??
    null;

  const lastParagraphIndex =
    characterText?.lastElementChild?.getAttribute("data-index") ??
    el.getAttribute?.("data-index") ??
    el.querySelector?.<HTMLElement>("[data-index]:last-child")?.getAttribute("data-index") ??
    firstParagraphIndex;

  return {
    chapter: Number.isFinite(chapter as number) ? (chapter as number) : null,
    firstParagraphIndex: firstParagraphIndex ? parseInt(firstParagraphIndex, 10) : null,
    lastParagraphIndex: lastParagraphIndex ? parseInt(lastParagraphIndex, 10) : null,
  };
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

  const bufferSize = isPlayFormat ? 5 : 10;

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

  const playRowsOrParagraphs: HTMLElement[] = [];

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

    // Support both play rows and plain paragraphs (non-play)
    playRowsOrParagraphs.push(p.closest(".play-row") ?? (p as HTMLElement));
  });

  const uniqueRows = [...new Set(playRowsOrParagraphs)];

  uniqueRows.forEach((rowEl: HTMLElement) => {
    const characterPlaceholders = rowEl.querySelectorAll<HTMLSpanElement>(".character-placeholder");
    if (!characterPlaceholders.length) return;

    const { chapter: rowChapter, firstParagraphIndex, lastParagraphIndex } = getRowContext(rowEl);

    if (firstParagraphIndex == null || lastParagraphIndex == null) return;

    characterPlaceholders.forEach((characterPlaceholder) => {
      const characterSlug = characterPlaceholder.dataset.character;
      if (!characterSlug?.trim()) return;

      const index = `${characterSlug}-${firstParagraphIndex}-${lastParagraphIndex}`;

      const locationForPlaceholder = { chapter: rowChapter ?? startChapter, paragraph: firstParagraphIndex ?? startParagraph };

      const characterData = charactersBySlug.get(characterSlug);
      const snapshot = characterData ? resolveCharacterSnapshot(characterData, { location: locationForPlaceholder, fallbackDisplayName: characterData.characterName }) : null;

      const dummyPlaceholder = characterPlaceholder.querySelector<HTMLSpanElement>(".dummy-avatar-placeholder");

      if (shouldCreateVideos && isPlayFormat && snapshot && !isMobile()) {
        // Create a narrower range for video (1 paragraph less on each side)
        const videoStartParagraph = Math.max(0, startParagraph + 1);
        const videoEndParagraph = Math.max(0, endParagraph - 1);
        const isValidNarrowRange = videoStartParagraph <= videoEndParagraph;

        // Searching for the active paragraph within the current row (play or non-play)
        const activeParagraph = document.querySelector<HTMLElement>(`.active-paragraph`);
        const activeRow = activeParagraph?.closest(".play-row") ?? activeParagraph;

        const isTalking = activeRow === rowEl;
        // Keep dataset in sync for modal logic even in play mode
        characterPlaceholder.dataset.isTalking = isTalking ? "true" : "false";

        // Only check if the narrower range is valid & row is within range
        const rowInExactRange =
          isValidNarrowRange && isInRange(rowChapter ?? startChapter, firstParagraphIndex ?? startParagraph, startChapter, videoStartParagraph, endChapter, videoEndParagraph);

        if (rowInExactRange) {
          const desiredState = isTalking ? "speaks" : "listens";
          const videoSrc = isTalking ? snapshot.media.talking : snapshot.media.listening;

          const inlineAvatar = characterPlaceholder.querySelector(".inline-avatar");
          const existingVideo = inlineAvatar?.querySelector("video");

          if (existingVideo) {
            const currentState = existingVideo.dataset.state;
            const currentSrcNormalized = existingVideo.src.split("/").pop() || "";
            const videoSrcNormalized = videoSrc?.split("/").pop() || "";

            // Only update if state or source needs to change
            if ((currentState !== desiredState || currentSrcNormalized !== videoSrcNormalized) && videoSrc && isVideoFile(videoSrc)) {
              // Optional soft fade-in swap
              existingVideo.style.opacity = "0";
              existingVideo.src = videoSrc;
              existingVideo.dataset.state = desiredState;
              existingVideo.onloadeddata = () => {
                requestAnimationFrame(() => {
                  existingVideo.style.opacity = "1";
                  existingVideo.play().catch((e) => console.warn("Video play failed:", e));
                });
              };
            }
            // If state and source match - do nothing, let it continue playing
          } else if (videoSrc && isVideoFile(videoSrc)) {
            const video = createVideoElement(videoSrc, desiredState);
            inlineAvatar?.appendChild(video);
          }
        }
      } else {
        // Non-play path: ensure dataset stays consistent
        characterPlaceholder.dataset.isTalking = "false";
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

      activatedMedia.set(index, rowEl);
    });
  });

  // Here we clean up the activated media
  activatedMedia.forEach((rowEl, index) => {
    if (!uniqueRows.includes(rowEl as HTMLElement)) {
      const characterPlaceholders = rowEl.querySelectorAll<HTMLSpanElement>(".character-placeholder");

      characterPlaceholders.forEach((characterPlaceholder) => {
        const dummyElement = createDummyElement(characterPlaceholder);
        characterPlaceholder.replaceChildren(dummyElement);
        characterPlaceholder.dataset.mediaInjected = "false";
        characterPlaceholder.dataset.isTalking = "false";
      });

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
    const isCharacterPlaceholder = target.closest(".character-placeholder");

    if (!isStrongTag && !isInlineAvatar && !isCharacterHighlighted && !isCharacterPlaceholder) return;

    e.preventDefault();
    e.stopPropagation();

    // Support both play and non-play: prefer .play-row, else fall back to the nearest [data-index] paragraph
    const rowOrParagraph = target.closest<HTMLElement>(".play-row") ?? target.closest<HTMLElement>("[data-index]");
    if (!rowOrParagraph) return;

    // Determine chapter/paragraph from the element we found
    const { chapter, firstParagraphIndex } = getRowContext(rowOrParagraph);
    if (chapter == null || firstParagraphIndex == null) return;

    // Pick the character slug from the activated highlight or from the placeholder
    let characterSlug = (isCharacterHighlighted ? target.dataset.character : undefined) || "";
    let characterPlaceholder: HTMLSpanElement | null = null;

    if (characterSlug) {
      characterPlaceholder = rowOrParagraph.querySelector<HTMLSpanElement>(`.character-placeholder[data-character="${characterSlug}"]`);
    }
    if (!characterPlaceholder) {
      // Fallback: take the first placeholder under this row/paragraph
      characterPlaceholder = rowOrParagraph.querySelector<HTMLSpanElement>(".character-placeholder");
      characterSlug = characterPlaceholder?.dataset.character || "";
    }

    if (!characterSlug.trim() || !characterPlaceholder) return;

    // Derive talking state without relying solely on dataset (dataset is still maintained elsewhere)
    const activeParagraph = document.querySelector<HTMLElement>(".active-paragraph");
    const activeRow = activeParagraph?.closest(".play-row") ?? activeParagraph;
    const isTalkingNow = activeRow === rowOrParagraph;

    const characterData = charactersBySlug.get(characterSlug);
    const snapshot = characterData
      ? resolveCharacterSnapshot(characterData, { location: { chapter, paragraph: firstParagraphIndex }, fallbackDisplayName: characterData.characterName })
      : null;

    const mediaSrc = snapshot ? (isTalkingNow ? snapshot.media.talking : snapshot.media.listening) : "";

    openCharacterDetailsModal({ characterSlug, isVideo: !!mediaSrc && isVideoFile(mediaSrc), mediaSrc: mediaSrc || "", chapter, paragraph: firstParagraphIndex });
  });
};
