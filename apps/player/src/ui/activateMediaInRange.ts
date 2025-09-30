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
  if (state === "listens") {
    video.style.opacity = isTalking ? "0" : "1";
  } else {
    // "speaks"
    video.style.opacity = isTalking ? "1" : "0";
  }

  video.onerror = () => {
    console.warn(`Failed to load ${state} video: ${src}`);
    video.style.display = "none";
  };
  video.play().catch((e) => console.warn("Video play interrupted or failed:", e));
  return video;
}

function handleContainerResponsiveVideo(container: HTMLDivElement, listeningSrc: string | null, isTalking: boolean) {
  const isMobileNow = isMobile(true, 650);
  const listeningVideo = container.querySelector('video[data-state="listens"]') as HTMLVideoElement | null;
  const speakingVideo = container.querySelector('video[data-state="speaks"]') as HTMLVideoElement | null;

  if (isMobileNow) {
    // Mobile: Remove listening video if it exists
    if (listeningVideo) {
      listeningVideo.remove();

      // Update hasVideos state
      if (speakingVideo) {
        container.dataset.hasVideos = "speaking-only";
        speakingVideo.style.opacity = isTalking ? "1" : "0";
      } else {
        delete container.dataset.hasVideos;
      }
    }
  } else {
    // Desktop: Add listening video if it doesn't exist but should exist
    if (!listeningVideo && listeningSrc && isVideoFile(listeningSrc)) {
      const newListeningVideo = createVideoElement(listeningSrc, "listens", isTalking);
      container.appendChild(newListeningVideo);

      // Update hasVideos state
      if (speakingVideo) {
        container.dataset.hasVideos = "true";
        newListeningVideo.style.opacity = isTalking ? "0" : "1";
        speakingVideo.style.opacity = isTalking ? "1" : "0";
      } else {
        container.dataset.hasVideos = "listening-only";
        newListeningVideo.style.opacity = "1";
      }
    }
  }
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

/** Updates video opacity based on talking state for inline avatars **/
function updateVideoState(container: HTMLDivElement, isTalking: boolean) {
  const hasVideos = container.dataset.hasVideos;
  if (!hasVideos || hasVideos === "listening-only") return;

  const listeningVideo = container.querySelector('video[data-state="listens"]') as HTMLVideoElement;
  const speakingVideo = container.querySelector('video[data-state="speaks"]') as HTMLVideoElement;

  if (hasVideos === "true" && listeningVideo && speakingVideo) {
    // Both videos available - image underneath, speaking covers listening
    listeningVideo.style.opacity = isTalking ? "0" : "1";
    speakingVideo.style.opacity = isTalking ? "1" : "0";
  } else if (hasVideos === "speaking-only" && speakingVideo) {
    // Only speaking video - image acts as listening state
    // When talking: show speaking video, when not talking: hide speaking video to show image
    speakingVideo.style.opacity = isTalking ? "1" : "0";
  }
}

/** Creates a media container element with CharacterMedia-like structure for inline avatars */
function createMediaElement(
  placeholder: HTMLSpanElement,
  openCharacterDetailsModal: (params: CharacterModalParams) => void,
  isPlayFormat: boolean,
  characterData: CharacterData | undefined,
  location: { chapter: number; paragraph: number } | null,
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
  const shouldCreateVideos = isPlayFormat && (listeningSrc || talkingSrc);
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

  container.addEventListener("pointerup", (e) => {
    if (e.metaKey || e.ctrlKey) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const preferredSrc = isTalking ? talkingSrc : listeningSrc;
    const mediaSrc = preferredSrc || listeningSrc || talkingSrc || "";

    openCharacterDetailsModal({ characterSlug, isVideo: Boolean(mediaSrc) && isVideoFile(mediaSrc), mediaSrc, chapter: location?.chapter, paragraph: location?.paragraph });
  });

  return container;
}

const activatedMedia = new Map<string, Element>();

/** Manages media loading and playback for paragraphs within the visible range **/
export function activateMediaInRange(
  startChapter: number,
  startParagraph: number,
  endChapter: number,
  endParagraph: number,
  openCharacterDetailsModal: (params: CharacterModalParams) => void,
  isPlayFormat: boolean,
) {
  // Global initialization - reset all isTalking states to "false" only once at the very beginning
  if (!hasInitializedTalkingStates) {
    const allPlaceholders = document.querySelectorAll<HTMLSpanElement>(".character-placeholder");
    allPlaceholders.forEach((placeholder) => {
      placeholder.dataset.isTalking = "false";
    });

    hasInitializedTalkingStates = true;
  }

  const charactersBySlug = new Map<string, CharacterData>();
  getCharactersData().forEach((character) => {
    charactersBySlug.set(character.slug, character);
  });

  // const allParagraphs = document.querySelectorAll<HTMLElement>("section[data-chapter] [data-index]");

  const paragraphs = document.querySelectorAll<HTMLElement>(`section[data-chapter="${startChapter}"] [data-index], section[data-chapter="${endChapter}"] [data-index]`);

  const bufferSize = isPlayFormat ? 6 : 10;

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

  const rootEl = document.getElementById("content-container");
  const rootRect = rootEl?.getBoundingClientRect() ?? null;

  const playRows = [];

  paragraphsInRange.forEach((p) => {
    // const chapterElement = p.closest("section[data-chapter]") as HTMLElement;
    // const chapterStr = chapterElement?.dataset.chapter;
    // const paragraphStr = p.dataset.index;
    // const index = `${chapterStr}-${paragraphStr}`;

    const playRow = p.closest(".play-row");
    playRows.push(playRow ?? (p as HTMLElement));

    // activatedMedia.set(index, p);
  });

  const uniquePlayRows = [...new Set(playRows)];

  uniquePlayRows.forEach((playRow: HTMLElement) => {
    const characterPlaceholder = playRow.querySelector<HTMLSpanElement>(".character-placeholder");

    if (characterPlaceholder) {
      // --- START ---
      const characterSlug = characterPlaceholder.dataset.character || null;

      const characterText = playRow.querySelector(".character-text");
      const index = `${characterSlug}-${characterText?.firstElementChild.getAttribute("data-index")}-${characterText?.lastElementChild.getAttribute("data-index")}`;

      const locationForPlaceholder = { chapter: startChapter, paragraph: startParagraph };
      const characterData = characterSlug ? charactersBySlug.get(characterSlug) : undefined;
      const snapshot = characterData ? resolveCharacterSnapshot(characterData, { location: locationForPlaceholder, fallbackDisplayName: characterData.characterName }) : null;
      const mediaInjected = characterPlaceholder.dataset.mediaInjected === "true";
      let mediaElement = characterPlaceholder.querySelector<HTMLDivElement>("div.inline-avatar");
      const dummyPlaceholder = characterPlaceholder.querySelector<HTMLSpanElement>(".dummy-avatar-placeholder");

      if (dummyPlaceholder) {
        // Found a dummy, replace it with actual media
        const newMediaElement = createMediaElement(characterPlaceholder, openCharacterDetailsModal, isPlayFormat, characterData, locationForPlaceholder, snapshot);
        if (newMediaElement) {
          characterPlaceholder.replaceChild(newMediaElement, dummyPlaceholder);
          characterPlaceholder.dataset.mediaInjected = "true"; // Mark as injected
          mediaElement = newMediaElement; // Update mediaElement reference

          // NOTE: Text was already hidden when media was first injected,
          // and remains hidden while the dummy is shown. No action needed here.
        }
      } else if (!mediaInjected) {
        // No dummy and no media injected yet, inject for the first time
        const newMediaElement = createMediaElement(characterPlaceholder, openCharacterDetailsModal, isPlayFormat, characterData, locationForPlaceholder, snapshot);
        if (newMediaElement) {
          mediaElement = newMediaElement; // Update mediaElement reference
          // Hide original text content if it's a mention
          if (characterPlaceholder.classList.contains("character-mention") && characterPlaceholder.firstChild && characterPlaceholder.firstChild.nodeType === Node.TEXT_NODE) {
            const textNode = characterPlaceholder.firstChild as Text;
            const wrapper = document.createElement("span");
            wrapper.style.display = "none"; // Hide the text
            wrapper.setAttribute("data-original-text", "true");
            wrapper.textContent = textNode.textContent;
            characterPlaceholder.replaceChild(wrapper, textNode);
          }
          characterPlaceholder.appendChild(mediaElement); // Append media
          characterPlaceholder.dataset.mediaInjected = "true"; // Mark as injected
        }
      } else if (mediaElement) {
        // Media already injected, update talking state and play videos if paused
        const currentIsTalking = characterPlaceholder.dataset.isTalking === "true";

        // Handle responsive video changes (add/remove listening video based on device type)
        const listeningSrc = snapshot?.media.listening || null;
        handleContainerResponsiveVideo(mediaElement, listeningSrc, currentIsTalking);

        // Update video state based on current talking status
        if (mediaElement.dataset.hasVideos === "true" || mediaElement.dataset.hasVideos === "speaking-only") {
          updateVideoState(mediaElement, currentIsTalking);
        }
      }
      // --- END ---
      activatedMedia.set(index, playRow);
    }
  });

  activatedMedia.forEach((playRow, index) => {
    if (!uniquePlayRows.includes(playRow as HTMLElement)) {
      const characterPlaceholder = playRow.querySelector<HTMLSpanElement>(".character-placeholder");

      if (characterPlaceholder) {
        // --- START ---
        const characterSlug = characterPlaceholder.dataset.character || null;

        const locationForPlaceholder = { chapter: startChapter, paragraph: startParagraph };
        const characterData = characterSlug ? charactersBySlug.get(characterSlug) : undefined;
        const snapshot = characterData ? resolveCharacterSnapshot(characterData, { location: locationForPlaceholder, fallbackDisplayName: characterData.characterName }) : null;
        const mediaInjected = characterPlaceholder.dataset.mediaInjected === "true";
        const mediaElement = characterPlaceholder.querySelector<HTMLDivElement>("div.inline-avatar");
        const dummyPlaceholder = characterPlaceholder.querySelector<HTMLSpanElement>(".dummy-avatar-placeholder");

        if (mediaInjected && mediaElement) {
          // Create dummy placeholder
          const dummyElement = document.createElement("span");
          // Add classes for styling (assuming CSS defines size, display, etc.)
          dummyElement.classList.add("dummy-avatar-placeholder");
          // Add inline-avatar if it helps with consistent styling (like margins, alignment)
          if (mediaElement.classList.contains("inline-avatar")) {
            dummyElement.classList.add("inline-avatar");
          }
          // Ensure necessary styles for sizing and alignment are present, either via CSS or inline
          dummyElement.style.display = "inline-block"; // Needed to respect width/height
          dummyElement.style.verticalAlign = mediaElement.style.verticalAlign || "bottom"; // Match original or default
          dummyElement.title = mediaElement.title || ""; // Preserve title if any
          dummyElement.classList.add("relative");

          // Try to keep the same placeholder image visible in the dummy
          const existingImg = mediaElement.querySelector("img");
          if (existingImg) {
            const imgClone = existingImg.cloneNode(true) as HTMLImageElement;
            dummyElement.appendChild(imgClone);
          }

          // Replace media with dummy
          characterPlaceholder.replaceChild(dummyElement, mediaElement);
          delete characterPlaceholder.dataset.mediaInjected; // Mark as not injected (dummy is present)

          // NOTE: Text remains hidden in its wrapper span. No need to restore/re-hide.
        } else {
          // We are out of view, and it's NOT (mediaInjected && mediaElement is valid)
          // `dummyPlaceholder` was queried at the start of the loop for this placeholder.
          if (!dummyPlaceholder && characterPlaceholder.dataset.isTalking === "true") {
            const newDummyElement = document.createElement("span");
            newDummyElement.classList.add("dummy-avatar-placeholder");
            newDummyElement.classList.add("inline-avatar");
            newDummyElement.style.display = "inline-block";
            newDummyElement.style.verticalAlign = "bottom";
            newDummyElement.classList.add("relative");

            // Compute and add placeholder image so the avatar never appears empty
            if (snapshot) {
              const placeholderSrcForDummy = normalizeSrcForInlineAvatar(snapshot.media.listening || snapshot.media.talking || "");
              if (placeholderSrcForDummy) {
                const img = document.createElement("img");
                img.src = placeholderSrcForDummy;
                img.classList.add("absolute", "top-0", "left-0", "w-full", "h-full", "object-cover", "rounded-full");
                img.alt = snapshot.displayName;
                newDummyElement.appendChild(img);
              }
            }

            characterPlaceholder.appendChild(newDummyElement);

            // Ensure mediaInjected is false, as we are showing a dummy or no media was ever injected.
            if (characterPlaceholder.dataset.mediaInjected === "true") {
              delete characterPlaceholder.dataset.mediaInjected;
            }
          }
        }
      }

      // --- END ---

      activatedMedia.delete(index);
    }
  });

  console.log("253: activatedMedia BANG!", activatedMedia);

  // const x = document.querySelectorAll<HTMLElement>(`section[data-chapter] [data-index]`);
  //
  // const allParagraphs = Array.from(x).filter((paragraph) => {
  //   const paragraphIndex = parseInt(paragraph.dataset.index, 10);
  //   // console.log("226: paragraphIndex BANG!", paragraphIndex);
  //   return paragraphIndex >= startParagraph && paragraphIndex <= endParagraph;
  // });
  //
  // const rootEl = document.getElementById("content-container");
  // const rootRect = rootEl?.getBoundingClientRect() ?? null;

  // allParagraphs.forEach((p) => {
  //   const chapterElement = p.closest("section[data-chapter]") as HTMLElement;
  //   const chapterStr = chapterElement?.dataset.chapter;
  //   const paragraphStr = p.dataset.index;
  //
  //   if (chapterStr && paragraphStr) {
  //     const currentChapter = parseInt(chapterStr, 10);
  //     const currentParagraph = parseInt(paragraphStr, 10);
  //
  //     const inView = isInRange(currentChapter, currentParagraph, startChapter, startParagraph - bufferSize, endChapter, endParagraph + bufferSize);
  //
  //     const playRow = p.closest(".play-row");
  //     const placeholders = (playRow ?? p).querySelectorAll<HTMLSpanElement>(".character-placeholder");
  //
  //     const charactersDisplayed = [];
  //     placeholders.forEach((placeholder) => {
  //       const characterSlug = placeholder.dataset.character || null;
  //       const characterData = characterSlug ? charactersBySlug.get(characterSlug) : undefined;
  //       const locationForPlaceholder = { chapter: currentChapter, paragraph: currentParagraph };
  //       const snapshot = characterData ? resolveCharacterSnapshot(characterData, { location: locationForPlaceholder, fallbackDisplayName: characterData.characterName }) : null;
  //       const mediaInjected = placeholder.dataset.mediaInjected === "true";
  //       // Query for either video or image with the class OR the dummy placeholder
  //       let mediaElement = placeholder.querySelector<HTMLDivElement>("div.inline-avatar");
  //       const dummyPlaceholder = placeholder.querySelector<HTMLSpanElement>(".dummy-avatar-placeholder");
  //       if (inView) {
  //         // Avoid injecting media above the current viewport top to prevent layout shifts that look like backward jumps.
  //         if (rootRect) {
  //           const pRect = p.getBoundingClientRect();
  //           if (pRect.top < rootRect.top) {
  //             // Skip injection for paragraphs that are above or even partially above the viewport top
  //             return;
  //           }
  //         }
  //         if (dummyPlaceholder) {
  //           // Found a dummy, replace it with actual media
  //           const newMediaElement = createMediaElement(placeholder, openCharacterDetailsModal, isPlayFormat, characterData, locationForPlaceholder, snapshot);
  //           if (newMediaElement) {
  //             placeholder.replaceChild(newMediaElement, dummyPlaceholder);
  //             placeholder.dataset.mediaInjected = "true"; // Mark as injected
  //             mediaElement = newMediaElement; // Update mediaElement reference
  //
  //             // NOTE: Text was already hidden when media was first injected,
  //             // and remains hidden while the dummy is shown. No action needed here.
  //           }
  //         } else if (!mediaInjected) {
  //           // No dummy and no media injected yet, inject for the first time
  //           const newMediaElement = createMediaElement(placeholder, openCharacterDetailsModal, isPlayFormat, characterData, locationForPlaceholder, snapshot);
  //           if (newMediaElement) {
  //             mediaElement = newMediaElement; // Update mediaElement reference
  //             // Hide original text content if it's a mention
  //             if (placeholder.classList.contains("character-mention") && placeholder.firstChild && placeholder.firstChild.nodeType === Node.TEXT_NODE) {
  //               const textNode = placeholder.firstChild as Text;
  //               const wrapper = document.createElement("span");
  //               wrapper.style.display = "none"; // Hide the text
  //               wrapper.setAttribute("data-original-text", "true");
  //               wrapper.textContent = textNode.textContent;
  //               placeholder.replaceChild(wrapper, textNode);
  //             }
  //             placeholder.appendChild(mediaElement); // Append media
  //             placeholder.dataset.mediaInjected = "true"; // Mark as injected
  //           }
  //         } else if (mediaElement) {
  //           // Media already injected, update talking state and play videos if paused
  //           const currentIsTalking = placeholder.dataset.isTalking === "true";
  //
  //           // Handle responsive video changes (add/remove listening video based on device type)
  //           const listeningSrc = snapshot?.media.listening || null;
  //           handleContainerResponsiveVideo(mediaElement, listeningSrc, currentIsTalking);
  //
  //           // Update video state based on current talking status
  //           if (mediaElement.dataset.hasVideos === "true" || mediaElement.dataset.hasVideos === "speaking-only") {
  //             updateVideoState(mediaElement, currentIsTalking);
  //           }
  //         }
  //       } else {
  //         // Out of view
  //         // Check if actual media is injected (not a dummy)
  //         if (mediaInjected && mediaElement) {
  //           // Create dummy placeholder
  //           const dummyElement = document.createElement("span");
  //           // Add classes for styling (assuming CSS defines size, display, etc.)
  //           dummyElement.classList.add("dummy-avatar-placeholder");
  //           // Add inline-avatar if it helps with consistent styling (like margins, alignment)
  //           if (mediaElement.classList.contains("inline-avatar")) {
  //             dummyElement.classList.add("inline-avatar");
  //           }
  //           // Ensure necessary styles for sizing and alignment are present, either via CSS or inline
  //           dummyElement.style.display = "inline-block"; // Needed to respect width/height
  //           dummyElement.style.verticalAlign = mediaElement.style.verticalAlign || "bottom"; // Match original or default
  //           dummyElement.title = mediaElement.title || ""; // Preserve title if any
  //           dummyElement.classList.add("relative");
  //
  //           // Try to keep the same placeholder image visible in the dummy
  //           const existingImg = mediaElement.querySelector("img");
  //           if (existingImg) {
  //             const imgClone = existingImg.cloneNode(true) as HTMLImageElement;
  //             dummyElement.appendChild(imgClone);
  //           }
  //
  //           // Replace media with dummy
  //           placeholder.replaceChild(dummyElement, mediaElement);
  //           delete placeholder.dataset.mediaInjected; // Mark as not injected (dummy is present)
  //
  //           // NOTE: Text remains hidden in its wrapper span. No need to restore/re-hide.
  //         } else {
  //           // We are out of view, and it's NOT (mediaInjected && mediaElement is valid)
  //           // `dummyPlaceholder` was queried at the start of the loop for this placeholder.
  //           if (!dummyPlaceholder && placeholder.dataset.isTalking === "true") {
  //             const newDummyElement = document.createElement("span");
  //             newDummyElement.classList.add("dummy-avatar-placeholder");
  //             newDummyElement.classList.add("inline-avatar");
  //             newDummyElement.style.display = "inline-block";
  //             newDummyElement.style.verticalAlign = "bottom";
  //             newDummyElement.classList.add("relative");
  //
  //             // Compute and add placeholder image so the avatar never appears empty
  //             if (snapshot) {
  //               const placeholderSrcForDummy = normalizeSrcForInlineAvatar(snapshot.media.listening || snapshot.media.talking || "");
  //               if (placeholderSrcForDummy) {
  //                 const img = document.createElement("img");
  //                 img.src = placeholderSrcForDummy;
  //                 img.classList.add("absolute", "top-0", "left-0", "w-full", "h-full", "object-cover", "rounded-full");
  //                 img.alt = snapshot.displayName;
  //                 newDummyElement.appendChild(img);
  //               }
  //             }
  //
  //             placeholder.appendChild(newDummyElement);
  //
  //             // Ensure mediaInjected is false, as we are showing a dummy or no media was ever injected.
  //             if (placeholder.dataset.mediaInjected === "true") {
  //               delete placeholder.dataset.mediaInjected;
  //             }
  //           }
  //         }
  //       }
  //       if (characterSlug) {
  //         charactersDisplayed.push(characterSlug);
  //       }
  //     });
  //     const charactersToHighlight = p.querySelectorAll<HTMLSpanElement>(".character-highlighted");
  //     const seenCharactersInParentP = new Set<string>();
  //
  //     charactersToHighlight.forEach((character) => {
  //       const charText = character.dataset.character;
  //       if (charText && !seenCharactersInParentP.has(charText) && !charactersDisplayed.includes(charText)) {
  //         seenCharactersInParentP.add(charText);
  //         highlightCharacter(character, openCharacterDetailsModal);
  //       }
  //     });
  //
  //     // Add click handler to whole paragraph when it's a character line
  //     if (p.dataset.isCharacter === "true" && p.dataset.clickListenerAttached !== "true") {
  //       const handler = (e: PointerEvent) => {
  //         if (e.metaKey || e.ctrlKey) return;
  //         e.preventDefault();
  //         e.stopPropagation();
  //
  //         const playRow = p.closest(".play-row") as HTMLElement | null;
  //         const placeholder = (playRow ?? p).querySelector<HTMLSpanElement>(".character-placeholder");
  //         const characterSlug = placeholder?.dataset.character;
  //         if (!characterSlug) return;
  //
  //         const isTalking = placeholder?.dataset.isTalking === "true";
  //         const characterData = charactersBySlug.get(characterSlug);
  //         const snapshotForClick = characterData
  //           ? resolveCharacterSnapshot(characterData, { location: { chapter: currentChapter, paragraph: currentParagraph }, fallbackDisplayName: characterData.characterName })
  //           : null;
  //
  //         const mediaSrc = snapshotForClick ? (isTalking ? snapshotForClick.media.talking : snapshotForClick.media.listening) : "";
  //
  //         openCharacterDetailsModal({
  //           characterSlug,
  //           isVideo: !!mediaSrc && isVideoFile(mediaSrc),
  //           mediaSrc: mediaSrc || "",
  //           chapter: currentChapter,
  //           paragraph: currentParagraph,
  //         });
  //       };
  //
  //       let elementToAddListenerTo = p;
  //       const spanInsideParagraph = p.querySelector<HTMLSpanElement>("span");
  //       if (spanInsideParagraph) {
  //         elementToAddListenerTo = spanInsideParagraph;
  //       }
  //       elementToAddListenerTo.addEventListener("pointerup", handler, { passive: false });
  //       p.dataset.clickListenerAttached = "true";
  //     }
  //   }
  // });
}
