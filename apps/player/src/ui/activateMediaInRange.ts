import { isVideoFile } from "@player/helpers/isVideoFile";
import { CharacterModalParams } from "@player/stores/modals/characterModal.store";
import { getPlaceholderFromVideoUrl } from "@player/utils/getPlaceholderFromVideoUrl";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { resolveCharacterSnapshot } from "@player/utils/characterOverrides";
import { isMobile } from "@player/utils/isMobileOrTablet";
import type { CharacterData } from "@player/types/book";
import type { CharacterSnapshot } from "@player/utils/characterOverrides";
import { normalizeSrcForInlineAvatar, highlightCharacter } from "./highlightCharacter";
import { getBookData } from "@player/genericBookDataGetters/getBookData";

function getActiveWithSiblingsSkippingDidaskalia(element: Element) {
  const result = [];

  // Get previous sibling
  let prev = element.previousElementSibling;
  while (prev && prev.classList.contains("didaskalia-row")) {
    prev = prev.previousElementSibling;
  }

  // Get next sibling
  let next = element.nextElementSibling;
  while (next && next.classList.contains("didaskalia-row")) {
    next = next.nextElementSibling;
  }

  // Add previous element if exists
  if (prev && prev.classList.contains("play-row")) {
    result.push({ state: "listens", row: prev });
  }

  // Add current element
  result.push({ state: "speaks", row: element });

  // Add next element if exists
  if (next && next.classList.contains("play-row")) {
    result.push({ state: "listens", row: next });
  }

  return result;
}

let charactersBySlugCache: Map<string, CharacterData> | null = null;
let cachedBookSlug: string | null = null;

function ensureBookScopedState(): Map<string, CharacterData> {
  const currentBookSlug = getBookData().slug;

  if (cachedBookSlug !== currentBookSlug) {
    cachedBookSlug = currentBookSlug;
    charactersBySlugCache = null;
  }

  if (!charactersBySlugCache) {
    charactersBySlugCache = new Map<string, CharacterData>();
    getCharactersData().forEach((c) => charactersBySlugCache!.set(c.slug, c));
  }

  return charactersBySlugCache;
}

function getCharactersBySlug() {
  return ensureBookScopedState();
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

/** Manages media loading and playback for paragraphs within the visible range **/
export function activateMediaInRange(startChapter: number, startParagraph: number, endChapter: number, endParagraph: number, isPlayFormat: boolean, shouldCreateVideos: boolean) {
  const charactersBySlug = ensureBookScopedState();

  if (shouldCreateVideos && isPlayFormat && !isMobile()) {
    const activeParagraph = document.querySelector<HTMLElement>(`.active-paragraph`);
    const activePlayRow = activeParagraph?.closest(".play-row");

    if (!activePlayRow) return;

    const chapterElement = activePlayRow?.closest<HTMLElement>("[data-chapter]");
    const chapterIndex = chapterElement?.dataset.chapter;

    const rows = getActiveWithSiblingsSkippingDidaskalia(activePlayRow);

    rows.forEach(({ row: playRow, state }: { row: Element; state: "speaks" | "listens" }) => {
      const characterPlaceholders = playRow?.querySelectorAll<HTMLSpanElement>(".character-placeholder");

      characterPlaceholders.forEach((activeCharacterPlaceholder) => {
        const characterSlug = activeCharacterPlaceholder?.dataset.character;
        const characterData = characterSlug ? charactersBySlug.get(characterSlug) : undefined;
        const inlineAvatar = activeCharacterPlaceholder?.querySelector(".inline-avatar");
        const existingVideo = inlineAvatar?.querySelector("video");
        const paragraphIndex = playRow?.querySelector<HTMLElement>("[data-index]")?.getAttribute("data-index");

        const locationForPlaceholder = { chapter: parseInt(chapterIndex, 10), paragraph: parseInt(paragraphIndex, 10) };

        const snapshot = characterData ? resolveCharacterSnapshot(characterData, { location: locationForPlaceholder, fallbackDisplayName: characterData.characterName }) : null;
        const videoSrc = state === "speaks" ? snapshot?.media.talking : snapshot?.media.listening;

        if (existingVideo) {
          if (typeof videoSrc === "string" && isVideoFile(videoSrc)) {
            if (existingVideo.dataset.state !== state || existingVideo.src !== videoSrc) {
              existingVideo.src = videoSrc;
              existingVideo.dataset.state = state;
            }
            activeCharacterPlaceholder.dataset.isTalking = state === "speaks" ? "true" : "false";
          } else {
            activeCharacterPlaceholder.dataset.isTalking = "false";
            existingVideo.remove();
          }
        } else if (typeof videoSrc === "string" && isVideoFile(videoSrc)) {
          const video = createVideoElement(videoSrc, state as "listens" | "speaks");
          activeCharacterPlaceholder.dataset.isTalking = state === "speaks" ? "true" : "false";
          inlineAvatar?.appendChild(video);
          playRow.setAttribute("data-activated-video", "true");
        }
      });
    });

    const activatedVideo = document.querySelectorAll<HTMLElement>(".play-row[data-activated-video='true']");

    activatedVideo.forEach((rowEl) => {
      if (rows.map(({ row }) => row).includes(rowEl)) return;

      rowEl.querySelectorAll("video").forEach((video) => {
        video.remove();
      });

      rowEl.dataset.activatedVideo = "false";
    });

    return;
  }

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

      const locationForPlaceholder = { chapter: rowChapter ?? startChapter, paragraph: firstParagraphIndex ?? startParagraph };

      const characterData = charactersBySlug.get(characterSlug);
      const snapshot = characterData ? resolveCharacterSnapshot(characterData, { location: locationForPlaceholder, fallbackDisplayName: characterData.characterName }) : null;

      const dummyPlaceholder = characterPlaceholder.querySelector<HTMLSpanElement>(".dummy-avatar-placeholder");

      const activatedMedia = document.querySelectorAll<HTMLElement>(".play-row[data-activated-media='true']");

      if (Array.from(activatedMedia).find((_rowEl) => _rowEl === rowEl)) return;

      const newMediaElement = createMediaElement(characterPlaceholder, characterData, locationForPlaceholder, snapshot);

      if (newMediaElement) {
        const existingInlineAvatar = characterPlaceholder.querySelector(".inline-avatar");
        if (!existingInlineAvatar) {
          if (dummyPlaceholder) {
            characterPlaceholder.replaceChild(newMediaElement, dummyPlaceholder);
          } else {
            characterPlaceholder.appendChild(newMediaElement);
          }
        }
      }

      rowEl.dataset.activatedMedia = "true";
    });
  });

  // Here we clean up the activated media

  const activatedMedia = document.querySelectorAll<HTMLElement>(".play-row[data-activated-media='true']");

  activatedMedia.forEach((rowEl) => {
    if (!uniqueRows.includes(rowEl)) {
      const characterPlaceholders = rowEl.querySelectorAll<HTMLSpanElement>(".character-placeholder");

      characterPlaceholders.forEach((characterPlaceholder) => {
        const dummyElement = createDummyElement(characterPlaceholder);
        characterPlaceholder.replaceChildren(dummyElement);
        characterPlaceholder.dataset.mediaInjected = "false";
        characterPlaceholder.dataset.isTalking = "false";
      });

      rowEl.dataset.activatedMedia = "false";
    }
  });
}

export const openPlayRowCharacterModal = (target: HTMLElement, openCharacterDetailsModal: (params: CharacterModalParams) => void) => {
  const charactersBySlug = getCharactersBySlug();

  const isCharacterHighlighted = target.classList.contains("character-highlighted-activated");
  const isCharacterPlaceholder = target.closest(".character-placeholder");

  // Support both play and non-play: prefer .play-row, else fall back to the nearest [data-index] paragraph
  const rowOrParagraph = target.closest<HTMLElement>(".play-row") ?? target.closest<HTMLElement>("[data-index]");
  if (!rowOrParagraph) return;

  // Determine chapter/paragraph from the element we found
  const { chapter, firstParagraphIndex } = getRowContext(rowOrParagraph);
  if (chapter == null || firstParagraphIndex == null) return;

  // Pick the character slug from the activated highlight or from the placeholder
  let characterSlug = "";
  let characterPlaceholder: HTMLSpanElement | null = null;

  if (isCharacterHighlighted) {
    characterSlug = target.dataset.character || "";
  } else {
    // Fallback to placeholder logic for other clicks
    if (isCharacterPlaceholder) {
      characterPlaceholder = target.closest<HTMLSpanElement>(".character-placeholder");
    } else {
      characterPlaceholder = rowOrParagraph.querySelector<HTMLSpanElement>(".character-placeholder");
    }

    characterSlug = characterPlaceholder?.dataset.character || "";
  }

  if (!characterSlug.trim()) return;

  const activeParagraph = document.querySelector<HTMLElement>(".active-paragraph");
  const activeRow = activeParagraph?.closest(".play-row") ?? activeParagraph;
  const isTalkingNow = activeRow === rowOrParagraph;

  const characterData = charactersBySlug.get(characterSlug);
  const snapshot = characterData
    ? resolveCharacterSnapshot(characterData, { location: { chapter, paragraph: firstParagraphIndex }, fallbackDisplayName: characterData.characterName })
    : null;

  const mediaSrc = snapshot ? (isTalkingNow ? snapshot.media.talking : snapshot.media.listening) : "";

  openCharacterDetailsModal({
    characterSlug,
    isVideo: !!mediaSrc && isVideoFile(mediaSrc),
    mediaSrc: mediaSrc || "",
    chapter,
    paragraph: firstParagraphIndex,
    isTalking: isTalkingNow,
  });
};
