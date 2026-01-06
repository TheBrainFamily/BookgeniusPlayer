import debounce from "lodash.debounce";
import { isVideoFile } from "@player/helpers/isVideoFile";
import { type CharacterModalParams } from "@player/stores/modals/characterModal.store";
import { getPlaceholderFromVideoUrl } from "@player/utils/getPlaceholderFromVideoUrl";
import { getCharactersData } from "@player/state/bookDataStore";
import { resolveCharacterSnapshot } from "@player/utils/characterOverrides";
import { isMobile } from "@player/utils/isMobileOrTablet";
import type { CharacterData } from "@player/types/book";
import type { CharacterSnapshot } from "@player/utils/characterOverrides";
import { normalizeSrcForInlineAvatar } from "./highlightCharacter";
import { activateCharacterInteractions } from "@player/helpers/activateCharacterInteractions";
import { activateFootnoteInteractions } from "@player/helpers/activateFootnoteInteractions";
import { getAvatarSource } from "@player/helpers/svgAvatars";

function getActiveWithSiblingsSkippingDidaskalia(
  element: Element,
): { row: Element; state: "listens" | "speaks" }[] {
  const result: { row: Element; state: "listens" | "speaks" }[] = [];

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

/** Lightweight <video> factory with sane defaults (autoplay/muted/loop/inline) */
function createVideoElement(src: string, state: "listens" | "speaks"): HTMLVideoElement {
  const video = document.createElement("video");
  video.src = src;
  video.classList.add(
    "absolute",
    "top-0",
    "left-0",
    "w-full",
    "h-full",
    "object-cover",
    "rounded-full",
    "transition-all",
    "duration-500",
    "ease-in-out",
  );
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.dataset.state = state;

  video.onerror = () => {
    console.warn(`Failed to load ${state} video: ${src}`);
    video.style.display = "none";
  };

  video.load();
  video.play().catch((e) => console.warn("Video play interrupted or failed:", e));

  return video;
}

/** Checks if a given chapter and paragraph index falls within the specified range **/
function isInRange(
  currentChapter: number,
  currentParagraph: number,
  startChapter: number,
  startParagraph: number,
  endChapter: number,
  endParagraph: number,
): boolean {
  // Single chapter range
  if (startChapter === endChapter) {
    return (
      currentChapter === startChapter &&
      currentParagraph >= startParagraph &&
      currentParagraph <= endParagraph
    );
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
// eslint-disable-next-line complexity -- DOM traversal with multiple fallback paths
function getRowContext(el: HTMLElement): {
  chapter: number | null;
  firstParagraphIndex: number | null;
  lastParagraphIndex: number | null;
} {
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

const INLINE_MEDIA_DEBOUNCE_MS = 100;

type PlayFormatMediaActivationPayload = { charactersBySlug: Map<string, CharacterData> };

const runPlayFormatMediaActivation = ({ charactersBySlug }: PlayFormatMediaActivationPayload) => {
  const activeParagraph = document.querySelector<HTMLElement>(`.active-paragraph`);
  const activePlayRow = activeParagraph?.closest(".play-row");

  if (!activePlayRow) {
    console.error("no active play row");
    return;
  }

  const chapterElement = activePlayRow?.closest<HTMLElement>("[data-chapter]");
  if (!chapterElement) {
    console.error("no chapter element");
    return;
  }
  const chapterIndex = chapterElement.dataset.chapter!;

  const rows = getActiveWithSiblingsSkippingDidaskalia(activePlayRow);

  rows.forEach(({ row: playRow, state }) => {
    const characterPlaceholders =
      playRow.querySelectorAll<HTMLSpanElement>(".character-placeholder");

    // eslint-disable-next-line complexity -- character placeholder hydration with video state management
    characterPlaceholders.forEach((activeCharacterPlaceholder) => {
      const characterSlug = activeCharacterPlaceholder?.dataset.character;
      const characterData = characterSlug ? charactersBySlug.get(characterSlug) : undefined;
      const inlineAvatar = activeCharacterPlaceholder?.querySelector(".inline-avatar");
      const existingVideo = inlineAvatar?.querySelector("video");
      const paragraphIndex = playRow
        .querySelector<HTMLElement>("[data-index]")
        ?.getAttribute("data-index");

      if (!paragraphIndex) {
        console.error("no paragraph index for play row", playRow);
        return;
      }

      const locationForPlaceholder = {
        chapter: parseInt(chapterIndex, 10),
        paragraph: parseInt(paragraphIndex, 10),
      };

      const snapshot = characterData
        ? resolveCharacterSnapshot(characterData, {
            location: locationForPlaceholder,
            fallbackDisplayName: characterData.characterName,
          })
        : null;
      const videoSrc = state === "speaks" ? snapshot?.media.talking : snapshot?.media.listening;

      // Case 1: Existing video needs update or removal
      if (existingVideo) {
        if (typeof videoSrc === "string" && isVideoFile(videoSrc)) {
          const videoPathname = getVideoPathname(videoSrc);
          const existingPathname = getVideoPathname(existingVideo.src);

          // VIDEO → VIDEO transition (state or source change)
          if (existingVideo.dataset.state !== state || existingPathname !== videoPathname) {
            const newVideo = createVideoElement(videoSrc, state as "listens" | "speaks");
            newVideo.style.opacity = "0";
            newVideo.style.zIndex = "1";
            existingVideo.style.zIndex = "2";

            inlineAvatar?.appendChild(newVideo);

            const fallbackTimeout = setTimeout(() => {
              newVideo.style.opacity = "1";
            }, 3000);

            const startCrossfade = () => {
              clearTimeout(fallbackTimeout);
              requestAnimationFrame(() => {
                newVideo.style.opacity = "1";
                existingVideo.style.opacity = "0";

                setTimeout(() => {
                  if (existingVideo.parentElement) {
                    existingVideo.remove();
                  }
                }, 500);
              });
            };

            // Check if already loaded (cached)
            if (newVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              startCrossfade();
            } else {
              newVideo.addEventListener("loadeddata", startCrossfade, { once: true });
            }
          }
          activeCharacterPlaceholder.dataset.isTalking = state === "speaks" ? "true" : "false";
        } else {
          // VIDEO → IMG transition (videoSrc is not valid)
          activeCharacterPlaceholder.dataset.isTalking = "false";

          existingVideo.style.opacity = "0";
          existingVideo.style.zIndex = "1";
          setTimeout(() => {
            if (existingVideo.parentElement) {
              existingVideo.remove();
            }
          }, 500);
        }
      }
      // Case 2: No existing video, need to add one
      else if (typeof videoSrc === "string" && isVideoFile(videoSrc)) {
        // IMG → VIDEO transition
        const video = createVideoElement(videoSrc, state as "listens" | "speaks");
        video.style.opacity = "0";
        video.style.zIndex = "2";
        activeCharacterPlaceholder.dataset.isTalking = state === "speaks" ? "true" : "false";

        inlineAvatar?.appendChild(video);

        const fallbackTimeout = setTimeout(() => {
          video.style.opacity = "1";
        }, 3000);

        const showVideo = () => {
          clearTimeout(fallbackTimeout);
          requestAnimationFrame(() => {
            video.style.opacity = "1";
          });
        };

        // Check if already loaded (cached)
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          showVideo();
        } else {
          video.addEventListener("loadeddata", showVideo, { once: true });
        }

        playRow.setAttribute("data-activated-video", "true");
      }
    });
  });

  const activatedVideo = document.querySelectorAll<HTMLElement>("[data-activated-video='true']");

  activatedVideo.forEach((rowEl) => {
    if (rows.map(({ row }) => row).includes(rowEl)) return;

    rowEl.querySelectorAll("video").forEach((video) => {
      video.remove();
    });

    rowEl.dataset.activatedVideo = "false";
  });
};

function generateFallbackAvatarUrl(characterSlug: string, displayName?: string): string {
  const name =
    displayName || characterSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return getAvatarSource({
    slug: characterSlug,
    characterName: name,
    bookSlug: "",
    infoPerChapter: [],
  });
}

function populateInlineAvatarShell(
  shell: HTMLElement,
  characterData: CharacterData | undefined,
  location: { chapter: number; paragraph: number } | null,
  snapshotOverride?: CharacterSnapshot | null,
): boolean {
  if (shell.querySelector("img")) {
    return false;
  }

  const characterSlug = shell.dataset.character;
  if (!characterSlug) {
    console.warn(`[populateInlineAvatarShell] shell has no data-character attribute`);
    return false;
  }

  if (!characterData) {
    console.warn(`[populateInlineAvatarShell] ${characterSlug}: no characterData provided`);
    return false;
  }

  const snapshot =
    snapshotOverride ??
    resolveCharacterSnapshot(characterData, {
      location,
      fallbackDisplayName: characterData.characterName,
    });
  const displayName = snapshot.displayName;
  const listeningSrc = snapshot.media.listening;
  const talkingSrc = snapshot.media.talking;
  let placeholderSrc = getPlaceholderFromVideoUrl(listeningSrc || talkingSrc || "");

  if (!placeholderSrc) {
    placeholderSrc = generateFallbackAvatarUrl(characterSlug, displayName);
  }

  shell.title = displayName;

  const placeholderImg = document.createElement("img");
  placeholderImg.src = normalizeSrcForInlineAvatar(placeholderSrc);
  placeholderImg.classList.add(
    "absolute",
    "top-0",
    "left-0",
    "w-full",
    "h-full",
    "object-cover",
    "rounded-full",
  );
  placeholderImg.alt = displayName;
  shell.appendChild(placeholderImg);

  return true;
}

function createMediaElement(
  placeholder: HTMLSpanElement,
  characterData: CharacterData | undefined,
  location: { chapter: number; paragraph: number } | null,
  snapshotOverride?: CharacterSnapshot | null,
): HTMLSpanElement | null {
  const characterSlug = placeholder.dataset.character;
  if (!characterSlug) {
    console.warn(`[createMediaElement] placeholder has no data-character`);
    return null;
  }

  if (!characterData) {
    console.warn(`[createMediaElement] ${characterSlug}: no characterData found`);
    return null;
  }

  const snapshot =
    snapshotOverride ??
    resolveCharacterSnapshot(characterData, {
      location,
      fallbackDisplayName: characterData.characterName,
    });
  const displayName = snapshot.displayName;
  const listeningSrc = snapshot.media.listening;
  const talkingSrc = snapshot.media.talking;
  let placeholderSrc = getPlaceholderFromVideoUrl(listeningSrc || talkingSrc || "");

  if (!placeholderSrc) {
    placeholderSrc = generateFallbackAvatarUrl(characterSlug, displayName);
  }

  const container = document.createElement("span");
  container.classList.add("inline-avatar", "relative", "w-full", "h-full");
  container.dataset.character = characterSlug;
  container.title = displayName;

  const placeholderImg = document.createElement("img");
  placeholderImg.src = normalizeSrcForInlineAvatar(placeholderSrc);
  placeholderImg.classList.add(
    "absolute",
    "top-0",
    "left-0",
    "w-full",
    "h-full",
    "object-cover",
    "rounded-full",
  );
  placeholderImg.alt = displayName;
  container.appendChild(placeholderImg);

  return container;
}

function createDummyElement(characterPlaceholder: HTMLSpanElement) {
  const existingInlineAvatar =
    characterPlaceholder.querySelector<HTMLSpanElement>(".inline-avatar");
  const dummyElement = document.createElement("span");
  dummyElement.classList.add("dummy-avatar-placeholder", "inline-avatar");

  if (existingInlineAvatar?.dataset.character) {
    dummyElement.dataset.character = existingInlineAvatar.dataset.character;
  }
  if (existingInlineAvatar?.title) {
    dummyElement.title = existingInlineAvatar.title;
  }

  const img = characterPlaceholder.querySelector<HTMLImageElement>("img");
  if (img) {
    dummyElement.appendChild(img.cloneNode(true));
  }
  return dummyElement;
}

function getVideoPathname(src: string): string {
  try {
    return new URL(src, window.location.origin).pathname;
  } catch {
    return src;
  }
}

const activatePlayFormatMediaDebounced = debounce(
  runPlayFormatMediaActivation,
  INLINE_MEDIA_DEBOUNCE_MS,
  { leading: true, trailing: true, maxWait: 500 },
);

/** Manages media loading and playback for paragraphs within the visible range **/
export function activateMediaInRange(
  startChapter: number,
  startParagraph: number,
  endChapter: number,
  endParagraph: number,
  isPlayFormat: boolean,
) {
  const charactersData = getCharactersData();
  const charactersBySlug = new Map(charactersData.map((c) => [c.slug, c]));

  if (isPlayFormat && !isMobile()) {
    const activeParagraph = document.querySelector<HTMLElement>(`.active-paragraph`);
    const activePlayRow = activeParagraph?.closest(".play-row");

    if (activePlayRow) {
      activatePlayFormatMediaDebounced({ charactersBySlug });
    } else {
      activatePlayFormatMediaDebounced.cancel();
    }
  } else {
    activatePlayFormatMediaDebounced.cancel();
  }

  // Build a proper selector for all chapters in range
  const chapterSelectors: string[] = [];
  for (let ch = startChapter; ch <= endChapter; ch++) {
    chapterSelectors.push(`#content-container section[data-chapter="${ch}"] [data-index]`);
  }
  const combinedSelector = chapterSelectors.join(", ");
  const paragraphs = document.querySelectorAll<HTMLElement>(combinedSelector);

  const bufferSize = isPlayFormat ? 5 : 10;

  const paragraphsInRange = Array.from(paragraphs).filter((paragraph) => {
    const chapterElement = paragraph.closest("section[data-chapter]") as HTMLElement;
    const chapterStr = chapterElement?.dataset.chapter;
    const paragraphStr = paragraph.dataset.index;

    if (chapterStr && paragraphStr) {
      const currentChapter = parseInt(chapterStr, 10);
      const currentParagraph = parseInt(paragraphStr, 10);
      return isInRange(
        currentChapter,
        currentParagraph,
        startChapter,
        startParagraph - bufferSize,
        endChapter,
        endParagraph + bufferSize,
      );
    }
  });

  const playRowsOrParagraphs: HTMLElement[] = [];

  paragraphsInRange.forEach((p) => {
    activateCharacterInteractions(p);
    activateFootnoteInteractions(p);
    // Support both play rows and plain paragraphs (non-play)
    playRowsOrParagraphs.push(p.closest(".play-row") ?? (p as HTMLElement));
  });

  const uniqueRows = [...new Set(playRowsOrParagraphs)];
  const activatedMedia = document.querySelectorAll<HTMLElement>("[data-activated-media='true']");

  // Hydrate drama table persona cells for sections in range
  const sectionsInRange = new Set<HTMLElement>();
  paragraphsInRange.forEach((p) => {
    const section = p.closest<HTMLElement>("section[data-chapter]");
    if (section) sectionsInRange.add(section);
  });
  sectionsInRange.forEach((section) => {
    hydrateInlineAvatarsInSection(section);
  });

  uniqueRows.forEach((rowEl: HTMLElement) => {
    const characterPlaceholders = rowEl.querySelectorAll<HTMLSpanElement>(".character-placeholder");
    if (!characterPlaceholders.length) return;

    const { chapter: rowChapter, firstParagraphIndex, lastParagraphIndex } = getRowContext(rowEl);

    if (firstParagraphIndex == null || lastParagraphIndex == null) return;

    characterPlaceholders.forEach((characterPlaceholder) => {
      const characterSlug = characterPlaceholder.dataset.character;
      if (!characterSlug?.trim()) return;

      const locationForPlaceholder = {
        chapter: rowChapter ?? startChapter,
        paragraph: firstParagraphIndex ?? startParagraph,
      };

      const characterData = charactersBySlug.get(characterSlug);
      const snapshot = characterData
        ? resolveCharacterSnapshot(characterData, {
            location: locationForPlaceholder,
            fallbackDisplayName: characterData.characterName,
          })
        : null;

      const dummyPlaceholder = characterPlaceholder.querySelector<HTMLSpanElement>(
        ".dummy-avatar-placeholder",
      );

      const existingInlineAvatar =
        characterPlaceholder.querySelector<HTMLElement>(".inline-avatar");
      let success = false;

      if (existingInlineAvatar) {
        const hasImg = existingInlineAvatar.querySelector("img");
        if (hasImg) {
          success = true;
        } else {
          success = populateInlineAvatarShell(
            existingInlineAvatar,
            characterData,
            locationForPlaceholder,
            snapshot,
          );
        }
      } else {
        const newMediaElement = createMediaElement(
          characterPlaceholder,
          characterData,
          locationForPlaceholder,
          snapshot,
        );

        if (newMediaElement) {
          if (dummyPlaceholder) {
            characterPlaceholder.replaceChild(newMediaElement, dummyPlaceholder);
          } else {
            characterPlaceholder.appendChild(newMediaElement);
          }
          success = true;
        }
      }

      if (success) {
        rowEl.dataset.activatedMedia = "true";
      }
    });
  });

  activatedMedia.forEach((rowEl) => {
    if (!uniqueRows.includes(rowEl)) {
      const characterPlaceholders =
        rowEl.querySelectorAll<HTMLSpanElement>(".character-placeholder");

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

export const openPlayRowCharacterModal = (
  target: HTMLElement,
  openCharacterDetailsModal: (params: CharacterModalParams) => void,
) => {
  const charactersBySlug = new Map(getCharactersData().map((c) => [c.slug, c]));

  const isCharacterHighlighted = target.classList.contains("character-highlighted-activated");
  const isCharacterPlaceholder = target.closest(".character-placeholder");

  // Support both play and non-play: prefer .play-row, else fall back to the nearest [data-index] paragraph
  const rowOrParagraph =
    target.closest<HTMLElement>(".play-row") ?? target.closest<HTMLElement>("[data-index]");
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
      characterPlaceholder =
        rowOrParagraph.querySelector<HTMLSpanElement>(".character-placeholder");
    }

    characterSlug = characterPlaceholder?.dataset.character || "";
  }

  if (!characterSlug.trim()) return;

  const activeParagraph = document.querySelector<HTMLElement>(".active-paragraph");
  const activeRow = activeParagraph?.closest(".play-row") ?? activeParagraph;
  const isTalkingNow = activeRow === rowOrParagraph;

  const characterData = charactersBySlug.get(characterSlug);
  const snapshot = characterData
    ? resolveCharacterSnapshot(characterData, {
        location: { chapter, paragraph: firstParagraphIndex },
        fallbackDisplayName: characterData.characterName,
      })
    : null;

  const mediaSrc = snapshot
    ? isTalkingNow
      ? snapshot.media.talking
      : snapshot.media.listening
    : "";

  openCharacterDetailsModal({
    characterSlug,
    isVideo: !!mediaSrc && isVideoFile(mediaSrc),
    mediaSrc: mediaSrc || "",
    chapter,
    paragraph: firstParagraphIndex,
    isTalking: isTalkingNow,
  });
};

export function hydrateInlineAvatarsInSection(section: HTMLElement): void {
  const charactersBySlug = new Map(getCharactersData().map((c) => [c.slug, c]));
  const chapterAttr = section.dataset.chapter;
  const chapterNumber = chapterAttr ? parseInt(chapterAttr, 10) : 0;

  const shells = section.querySelectorAll<HTMLElement>(".inline-avatar:not(:has(img))");
  shells.forEach((shell) => {
    const characterSlug = shell.dataset.character;
    if (!characterSlug) return;

    const characterData = charactersBySlug.get(characterSlug);
    const paragraphEl = shell.closest<HTMLElement>("[data-index]");
    const paragraphIndex = paragraphEl?.dataset.index ? parseInt(paragraphEl.dataset.index, 10) : 0;
    const location = { chapter: chapterNumber, paragraph: paragraphIndex };

    populateInlineAvatarShell(shell, characterData, location);
  });

  const personaCells = section.querySelectorAll<HTMLElement>(
    "table[data-drama] td[data-persona]:not(:has(.inline-avatar))",
  );
  personaCells.forEach((cell) => {
    const row = cell.closest<HTMLElement>("tr[data-speaker]");
    const characterSlug = row?.dataset.speaker;
    if (!characterSlug) return;

    const characterData = charactersBySlug.get(characterSlug);
    if (!characterData) return;

    const location = { chapter: chapterNumber, paragraph: 0 };
    const snapshot = resolveCharacterSnapshot(characterData, {
      location,
      fallbackDisplayName: characterData.characterName,
    });
    const displayName = snapshot.displayName;
    const listeningSrc = snapshot.media.listening;
    const talkingSrc = snapshot.media.talking;
    let placeholderSrc = getPlaceholderFromVideoUrl(listeningSrc || talkingSrc || "");

    if (!placeholderSrc) {
      placeholderSrc = generateFallbackAvatarUrl(characterSlug, displayName);
    }

    const container = document.createElement("span");
    container.classList.add("inline-avatar");
    container.dataset.character = characterSlug;
    container.title = displayName;

    const placeholderImg = document.createElement("img");
    placeholderImg.src = normalizeSrcForInlineAvatar(placeholderSrc);
    placeholderImg.classList.add("rounded-full");
    placeholderImg.alt = displayName;
    container.appendChild(placeholderImg);

    cell.insertBefore(container, cell.firstChild);
  });
}
