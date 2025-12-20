import { isVideoFile } from "@player/helpers/isVideoFile";
import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { resolveCharacterSnapshot, parseChapterParagraphId } from "@player/utils/characterOverrides";
import type { CharacterData, ChapterParagraphRef } from "@player/types/book";
import { CharacterModalParams } from "@player/stores/modals/characterModal.store";
import { getAvatarUrlForVideo } from "@player/utils/assetUrls";

let avatarContainerEl: HTMLDivElement | null = null;
let globalGuardsAttached = false;

let currentAnchorEl: HTMLElement | null = null;
let hoverDebounceTimeout: number | null = null;
let removalDelayTimeout: number | null = null;

const HOVER_DEBOUNCE_MS = 50;
const DEFAULT_AVATAR_SIZE = 100;
const VIEWPORT_PAD = 8;
const VERTICAL_GAP = 10;
const HIDE_TRANSITION_MS = 250;

/** Keep track of elements already wired to avoid duplicate listeners */
const initializedCharacters = new WeakSet<HTMLElement>();

const charactersBySlug = new Map<string, CharacterData>();

function getCharacterDataBySlug(slug: string): CharacterData | undefined {
  if (!charactersBySlug.has(slug)) {
    charactersBySlug.clear();
    getCharactersData().forEach((character) => charactersBySlug.set(character.slug, character));
  }

  return charactersBySlug.get(slug);
}

function extractLocationFromCharacterEl(el: HTMLElement): ChapterParagraphRef | null {
  const sentenceSpan = el.closest<HTMLSpanElement>("span[id^='ch']");
  const fromId = parseChapterParagraphId(sentenceSpan?.id);
  if (fromId) {
    return fromId;
  }

  const paragraphEl = el.closest<HTMLElement>("[data-index]");
  if (!paragraphEl) {
    return null;
  }

  const chapterSection = paragraphEl.closest<HTMLElement>("section[data-chapter]");
  if (!chapterSection) {
    return null;
  }

  const chapter = Number.parseInt(chapterSection.dataset.chapter ?? "", 10);
  const paragraph = Number.parseInt(paragraphEl.dataset.index ?? "", 10);

  if (Number.isNaN(chapter) || Number.isNaN(paragraph)) {
    return null;
  }

  return { chapter, paragraph };
}

/** Ensure a single floating avatar container exists */
function ensureAvatarContainer(): HTMLDivElement {
  if (avatarContainerEl) return avatarContainerEl;

  avatarContainerEl = document.createElement("div");
  avatarContainerEl.className = "floating-avatar";
  document.body.appendChild(avatarContainerEl);
  attachGlobalGuardsOnce();

  return avatarContainerEl;
}

function setAvatarMedia(avatarSrc: string) {
  if (!avatarContainerEl) return;
  if (avatarContainerEl.dataset.src === avatarSrc) return;

  avatarContainerEl.dataset.src = avatarSrc;
  avatarContainerEl.innerHTML = "";

  let mediaEl: HTMLVideoElement | HTMLImageElement;

  if (isVideoFile(avatarSrc.toLowerCase())) {
    const video = document.createElement("video");
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.src = avatarSrc;
    mediaEl = video;
  } else {
    const img = document.createElement("img");
    img.decoding = "async";
    img.loading = "eager";
    img.src = avatarSrc;
    mediaEl = img;
  }

  mediaEl.classList.add("avatar-preview");
  avatarContainerEl.appendChild(mediaEl);
}

/** Measure avatar size from computed styles (fallback to defaults) */
function measureAvatarSize(): { w: number; h: number } {
  const mediaChildEl = avatarContainerEl?.firstElementChild as HTMLElement | null;
  if (!mediaChildEl) return { w: DEFAULT_AVATAR_SIZE, h: DEFAULT_AVATAR_SIZE };

  const computed = getComputedStyle(mediaChildEl);
  const w = parseFloat(computed.width) || mediaChildEl.offsetWidth || DEFAULT_AVATAR_SIZE;
  const h = parseFloat(computed.height) || mediaChildEl.offsetHeight || DEFAULT_AVATAR_SIZE;

  return { w, h };
}

/** Position the floating avatar above/below and centered relative to anchor rect */
function positionAvatarAroundRect(anchorRect: DOMRect) {
  if (!avatarContainerEl) return;

  const { w: avatarWidth, h: avatarHeight } = measureAvatarSize();

  // Prefer above; if clipped, place below
  let top = anchorRect.top - avatarHeight - VERTICAL_GAP;
  if (top < VIEWPORT_PAD) top = anchorRect.bottom + VERTICAL_GAP;

  // Center horizontally with viewport clamping
  let left = anchorRect.left + anchorRect.width / 2 - avatarWidth / 2;
  const maxLeft = window.innerWidth - avatarWidth - VIEWPORT_PAD;
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
  if (left > maxLeft) left = maxLeft;

  avatarContainerEl.style.top = `${Math.round(top)}px`;
  avatarContainerEl.style.left = `${Math.round(left)}px`;
}

/** Attach once: global guards that dismiss the floating avatar on context changes */
function attachGlobalGuardsOnce() {
  if (globalGuardsAttached) return;
  globalGuardsAttached = true;

  const dismissNow = () => hideFloatingAvatar();

  window.addEventListener("scroll", dismissNow, { passive: true, capture: true });
  window.addEventListener("resize", dismissNow, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => document.hidden && dismissNow(), { capture: true });
}

function showFloatingAvatar(anchorEl: HTMLElement, avatarSrc: string) {
  const container = ensureAvatarContainer();

  // Cancel any pending removal (reuse the same container)
  if (removalDelayTimeout) {
    clearTimeout(removalDelayTimeout);
    removalDelayTimeout = null;
  }

  currentAnchorEl = anchorEl;
  setAvatarMedia(avatarSrc);
  positionAvatarAroundRect(anchorEl.getBoundingClientRect());

  // Force CSS transition
  requestAnimationFrame(() => container.classList.add("visible"));
}

function hideFloatingAvatar(requester?: HTMLElement) {
  if (!avatarContainerEl) return;
  if (requester && requester !== currentAnchorEl) return;

  const node = avatarContainerEl;
  node.classList.remove("visible");

  const removeNow = () => {
    if (!avatarContainerEl) return;

    // Pause video to save resources
    const v = node.querySelector("video") as HTMLVideoElement | null;
    if (v) v.pause();

    avatarContainerEl.remove();
    avatarContainerEl = null;
    currentAnchorEl = null;
    removalDelayTimeout = null;
  };

  if (removalDelayTimeout) clearTimeout(removalDelayTimeout);
  removalDelayTimeout = window.setTimeout(removeNow, HIDE_TRANSITION_MS);
}

export function highlightCharacter(characterEl: HTMLSpanElement) {
  if (initializedCharacters.has(characterEl)) return;

  const characterSlug = characterEl.dataset.character;
  if (!characterSlug) return;

  const characterData = getCharacterDataBySlug(characterSlug);
  if (!characterData) return;

  const location = extractLocationFromCharacterEl(characterEl);

  const snapshot = resolveCharacterSnapshot(characterData, { location, fallbackDisplayName: characterData.characterName });

  const listeningSrc = snapshot.media.listening;
  const avatarSrc = listeningSrc ? normalizeSrcForInlineAvatar(listeningSrc) : "";
  const hasListeningMedia = Boolean(avatarSrc);

  initializedCharacters.add(characterEl);

  characterEl.classList.add("character-highlighted-activated");

  if (!hasListeningMedia) return;

  // Only attach hover behavior on devices that actually support hover
  const supportsHover = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(hover: hover)").matches;
  if (supportsHover) {
    characterEl.addEventListener("pointerenter", () => {
      if (hoverDebounceTimeout) clearTimeout(hoverDebounceTimeout);
      if (HOVER_DEBOUNCE_MS > 0) {
        hoverDebounceTimeout = window.setTimeout(() => showFloatingAvatar(characterEl, avatarSrc), HOVER_DEBOUNCE_MS);
      } else {
        showFloatingAvatar(characterEl, avatarSrc);
      }
    });

    const handlePointerOut = () => {
      if (hoverDebounceTimeout) {
        clearTimeout(hoverDebounceTimeout);
        hoverDebounceTimeout = null;
      }

      hideFloatingAvatar(characterEl);
    };

    characterEl.addEventListener("pointerleave", handlePointerOut);

    characterEl.addEventListener("pointercancel", handlePointerOut);
  }
}

/**
 * Normalizes the src to always be PNG and removes "speaks" or "listens" suffixes.
 * For live mode Convex URLs, looks up the avatar URL from the registry.
 */
export function normalizeSrcForInlineAvatar(src: string): string {
  if (!src) return src;

  // For live mode: check if this is a video URL with a mapped avatar
  const avatarUrl = getAvatarUrlForVideo(src);
  if (avatarUrl) {
    return avatarUrl;
  }

  // Preserve query/hash separately so we don't mangle them
  let pathPart = src;
  let query = "";
  let hash = "";

  const hashIdx = src.indexOf("#");
  if (hashIdx !== -1) {
    hash = src.slice(hashIdx);
    pathPart = src.slice(0, hashIdx);
  }

  const qIdx = pathPart.indexOf("?");
  if (qIdx !== -1) {
    query = pathPart.slice(qIdx);
    pathPart = pathPart.slice(0, qIdx);
  }

  // Split directory + filename
  const lastSlash = pathPart.lastIndexOf("/");
  const dir = lastSlash >= 0 ? pathPart.slice(0, lastSlash + 1) : "";
  let file = lastSlash >= 0 ? pathPart.slice(lastSlash + 1) : pathPart;

  // Remove "-speaks" or "-listens" only when they appear immediately before the final extension or at end
  file = file.replace(/-(speaks|listens)(?=(\.[^.\/]+$|$))/i, "");

  // Replace final extension with .png, or add .png if none
  if (/\.[^.\/]+$/.test(file)) {
    file = file.replace(/\.[^.\/]+$/, ".png");
  } else {
    file = `${file}.png`;
  }

  return `${dir}${file}${query}${hash}`;
}
