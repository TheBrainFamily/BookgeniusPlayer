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

function createVideoElement(src: string, state: "listens" | "speaks", isTalking: boolean): HTMLVideoElement {
  const video = document.createElement("video");
  video.src = src;
  video.classList.add("absolute", "top-0", "left-0", "w-full", "h-full", "object-cover", "rounded-full", "transition-opacity", "duration-300", "ease-in-out");
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.dataset.state = state;

  // Set opacity based on state and talking status
  // if (state === "listens") {
  //   video.style.opacity = isTalking ? "0" : "1";
  // } else {
  //   // "speaks"
  //   video.style.opacity = isTalking ? "1" : "0";
  // }

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

const onPlayRowCharacterClick = (
  e: PointerEvent,
  characterSlug: string,
  mediaSrc: string,
  location: { chapter: number; paragraph: number },
  openCharacterDetailsModal: (params: CharacterModalParams) => void,
) => {
  if (e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  e.stopPropagation();
  openCharacterDetailsModal({ characterSlug, isVideo: !!mediaSrc && isVideoFile(mediaSrc), mediaSrc: mediaSrc || "", chapter: location.chapter, paragraph: location.paragraph });
};

/** Creates a media container element with CharacterMedia-like structure for inline avatars */
function createMediaElement(
  placeholder: HTMLSpanElement,
  isPlayFormat: boolean,
  characterData: CharacterData | undefined,
  location: { chapter: number; paragraph: number } | null,
  shouldCreateVideos: boolean,
  snapshotOverride?: CharacterSnapshot | null,
): HTMLDivElement | null {
  const characterSlug = placeholder.dataset.character;
  if (!characterSlug || !characterData) return null;

  const snapshot = snapshotOverride ?? resolveCharacterSnapshot(characterData, { location, fallbackDisplayName: characterData.characterName });

  const isTalking = placeholder.dataset.isTalking === "true";
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

  // Create videos if in play format and we have media sources
  // const shouldCreateVideos = isPlayFormat && (listeningSrc || talkingSrc);
  if (shouldCreateVideos) {
    let listeningVideo: HTMLVideoElement | null = null;
    let speakingVideo: HTMLVideoElement | null = null;

    if (listeningSrc && isVideoFile(listeningSrc) && !isMobile(true, 650)) {
      listeningVideo = createVideoElement(listeningSrc, "listens", isTalking);
      container.appendChild(listeningVideo);
    }

    if (talkingSrc && isVideoFile(talkingSrc)) {
      speakingVideo = createVideoElement(talkingSrc, "speaks", isTalking);
      container.appendChild(speakingVideo);
    }

    if (listeningVideo && speakingVideo) {
      listeningVideo.style.opacity = isTalking ? "0" : "1";
      speakingVideo.style.opacity = isTalking ? "1" : "0";
      container.dataset.hasVideos = "true";
    } else if (speakingVideo && !listeningVideo) {
      speakingVideo.style.opacity = isTalking ? "1" : "0";
      container.dataset.hasVideos = "speaking-only";
    } else if (listeningVideo && !speakingVideo) {
      listeningVideo.style.opacity = "1";
      container.dataset.hasVideos = "listening-only";
    }
  }

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
  activeChapter: number,
  activeParagraph: number,
  shouldCreateVideos: boolean,
) {
  // console.log("171: { startChapter, startParagraph, endChapter, endParagraph, isPlayFormat, shouldCreateVideos} BANG!", {
  //   startChapter,
  //   startParagraph,
  //   endChapter,
  //   endParagraph,
  //   isPlayFormat,
  //   shouldCreateVideos,
  // });
  // Global initialization - reset all isTalking states to "false" only once at the very beginning
  if (!hasInitializedTalkingStates) {
    // const allPlaceholders = document.querySelectorAll<HTMLSpanElement>(".character-placeholder");
    // allPlaceholders.forEach((placeholder) => {
    //   placeholder.dataset.isTalking = "false";
    // });

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

    console.log("252: shouldCreateVideos BANG!", shouldCreateVideos);

    const locationForPlaceholder = { chapter: startChapter, paragraph: startParagraph };
    const characterData = charactersBySlug.get(characterSlug);
    const snapshot = characterData ? resolveCharacterSnapshot(characterData, { location: locationForPlaceholder, fallbackDisplayName: characterData.characterName }) : null;
    const dummyPlaceholder = characterPlaceholder.querySelector<HTMLSpanElement>(".dummy-avatar-placeholder");

    if (shouldCreateVideos) {
      // if (Boolean(characterPlaceholder.querySelector("video"))) return;
      const activeParagraph = document.querySelector<HTMLElement>(`.active-paragraph`);

      const playRow = activeParagraph?.closest(".play-row");
      const _characterPlaceholder = playRow?.querySelector<HTMLSpanElement>(".character-placeholder");

      console.log("268: _characterPlaceholder BANG!", _characterPlaceholder);

      const isTalking = characterPlaceholder.dataset.isTalking === "true";
      const talkingSrc = snapshot.media.talking;
      const listeningSrc = snapshot.media.listening;

      const inlineAvatar = characterPlaceholder.querySelector(".inline-avatar");

      console.log("270: { activeChapter, activeParagraph} BANG!", { activeChapter, activeParagraph });

      const videoElement = inlineAvatar?.querySelector("video");

      if (!Boolean(videoElement)) {
        const video = createVideoElement(isTalking ? talkingSrc : listeningSrc, isTalking ? "speaks" : "listens", isTalking);

        inlineAvatar?.appendChild(video);
      }

      // console.log("268: characterPlaceholder BANG!", characterPlaceholder);
      // console.log("268: video BANG!", video);

      // inlineAvatar?.childNodes.forEach((node) => {
      //   const element = node as HTMLElement;
      //   const isTalkingNow = element.dataset.state === "speaks";
      //   if (element.tagName !== "VIDEO") {
      //
      //   }
      // });

      // const newMediaElement = createMediaElement(characterPlaceholder, isPlayFormat, characterData, locationForPlaceholder, shouldCreateVideos, snapshot);
      // if (!newMediaElement) return;
      // characterPlaceholder.replaceChildren(newMediaElement);
    }

    if (activatedMedia.has(index)) return;

    const newMediaElement = createMediaElement(characterPlaceholder, isPlayFormat, characterData, locationForPlaceholder, shouldCreateVideos, snapshot);

    if (newMediaElement) {
      if (dummyPlaceholder) {
        characterPlaceholder.replaceChild(newMediaElement, dummyPlaceholder);
      } else {
        characterPlaceholder.appendChild(newMediaElement);
      }
      characterPlaceholder.dataset.mediaInjected = "true";
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
