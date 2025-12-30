import { getNotes, getFullStore } from "@player/state/bookDataStore";
import { useFootnoteModal } from "@player/stores/modals/footnoteModal.store";
import { useNoteEditModal } from "@player/stores/modals/noteEditModal.store";
import { getGlobalEditModeActive } from "@player/context/EditModeContext";

let footnoteContainerEl: HTMLDivElement | null = null;
let globalGuardsAttached = false;

let currentAnchorEl: HTMLElement | null = null;
let hoverDebounceTimeout: number | null = null;
let removalDelayTimeout: number | null = null;

const HOVER_DEBOUNCE_MS = 100;
const VIEWPORT_PAD = 8;
const VERTICAL_GAP = 10;
const HIDE_TRANSITION_MS = 250;

/** Keep track of elements already wired to avoid duplicate listeners */
const initializedFootnotes = new WeakSet<HTMLElement>();

const footnoteContentCache = new Map<string, string>();

export function invalidateFootnoteCache(noteId?: string): void {
  if (noteId) {
    footnoteContentCache.delete(noteId);
  } else {
    footnoteContentCache.clear();
  }
}

export function updateFootnoteCache(noteId: string, newContent: string): void {
  footnoteContentCache.set(noteId, newContent);
}

function getFootnoteContent(footnoteId: string): string | null {
  if (footnoteContentCache.has(footnoteId)) {
    return footnoteContentCache.get(footnoteId)!;
  }

  const allNotes = getNotes();
  const note = allNotes.find((n) => n.id === footnoteId);

  if (note) {
    footnoteContentCache.set(footnoteId, note.content);
    return note.content;
  }

  return null;
}

/** Ensure a single floating footnote container exists */
function ensureFootnoteContainer(): HTMLDivElement {
  if (footnoteContainerEl) return footnoteContainerEl;

  footnoteContainerEl = document.createElement("div");
  footnoteContainerEl.className = "floating-footnote";
  document.body.appendChild(footnoteContainerEl);
  attachGlobalGuardsOnce();

  return footnoteContainerEl;
}

function setFootnoteContent(html: string) {
  if (!footnoteContainerEl) return;
  footnoteContainerEl.innerHTML = html;
}

/** Measure footnote size from computed styles */
function measureFootnoteSize(): { w: number; h: number } {
  if (!footnoteContainerEl) return { w: 200, h: 100 };

  const w = footnoteContainerEl.offsetWidth || 200;
  const h = footnoteContainerEl.offsetHeight || 100;

  return { w, h };
}

/** Position the floating footnote above/below the anchor element */
function positionFootnoteAroundRect(anchorRect: DOMRect) {
  if (!footnoteContainerEl) return;

  const { w: footnoteWidth, h: footnoteHeight } = measureFootnoteSize();

  // Prefer above; if clipped, place below
  let top = anchorRect.top - footnoteHeight - VERTICAL_GAP;
  if (top < VIEWPORT_PAD) top = anchorRect.bottom + VERTICAL_GAP;

  // Align with the anchor horizontally, clamped to viewport
  let left = anchorRect.left;
  const maxLeft = window.innerWidth - footnoteWidth - VIEWPORT_PAD;
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
  if (left > maxLeft) left = maxLeft;

  footnoteContainerEl.style.top = `${Math.round(top)}px`;
  footnoteContainerEl.style.left = `${Math.round(left)}px`;
}

/** Attach once: global guards that dismiss the floating footnote on context changes */
function attachGlobalGuardsOnce() {
  if (globalGuardsAttached) return;
  globalGuardsAttached = true;

  const dismissNow = () => hideFloatingFootnote();

  window.addEventListener("scroll", dismissNow, { passive: true, capture: true });
  window.addEventListener("resize", dismissNow, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => document.hidden && dismissNow(), { capture: true });
}

function showFloatingFootnote(anchorEl: HTMLElement, html: string) {
  const container = ensureFootnoteContainer();

  // Cancel any pending removal (reuse the same container)
  if (removalDelayTimeout) {
    clearTimeout(removalDelayTimeout);
    removalDelayTimeout = null;
  }

  currentAnchorEl = anchorEl;
  setFootnoteContent(html);
  positionFootnoteAroundRect(anchorEl.getBoundingClientRect());

  // Force CSS transition
  requestAnimationFrame(() => container.classList.add("visible"));
}

function hideFloatingFootnote(requester?: HTMLElement) {
  if (!footnoteContainerEl) return;
  if (requester && requester !== currentAnchorEl) return;

  const node = footnoteContainerEl;
  node.classList.remove("visible");

  const removeNow = () => {
    if (!footnoteContainerEl) return;

    footnoteContainerEl.remove();
    footnoteContainerEl = null;
    currentAnchorEl = null;
    removalDelayTimeout = null;
  };

  if (removalDelayTimeout) clearTimeout(removalDelayTimeout);
  removalDelayTimeout = window.setTimeout(removeNow, HIDE_TRANSITION_MS);
}

function openFootnoteModal(html: string) {
  useFootnoteModal.getState().openModal(html);
}

function openNoteEditModal(noteId: string, content: string) {
  const bookPath = getFullStore().book?.path;
  if (!bookPath) {
    console.warn("[highlightFootnote] Cannot open edit modal: book path not available");
    return;
  }
  useNoteEditModal.getState().openModal({ noteId, content, bookPath });
}

export function highlightFootnote(linkNoteEl: HTMLAnchorElement) {
  if (initializedFootnotes.has(linkNoteEl)) return;

  const noteNumber = linkNoteEl.getAttribute("data-note");
  if (!noteNumber) return;

  const footnoteId = `fn${noteNumber}`;

  if (!getFootnoteContent(footnoteId)) {
    console.warn(`Footnote content not found for ID: ${footnoteId}`);
    return;
  }

  initializedFootnotes.add(linkNoteEl);
  linkNoteEl.classList.add("footnote-activated");

  const supportsHover = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(hover: hover)").matches;

  if (supportsHover) {
    linkNoteEl.addEventListener("pointerenter", () => {
      const content = getFootnoteContent(footnoteId);
      if (!content) return;
      if (hoverDebounceTimeout) clearTimeout(hoverDebounceTimeout);
      if (HOVER_DEBOUNCE_MS > 0) {
        hoverDebounceTimeout = window.setTimeout(() => showFloatingFootnote(linkNoteEl, content), HOVER_DEBOUNCE_MS);
      } else {
        showFloatingFootnote(linkNoteEl, content);
      }
    });

    const handlePointerOut = () => {
      if (hoverDebounceTimeout) {
        clearTimeout(hoverDebounceTimeout);
        hoverDebounceTimeout = null;
      }
      hideFloatingFootnote(linkNoteEl);
    };

    linkNoteEl.addEventListener("pointerleave", handlePointerOut);
    linkNoteEl.addEventListener("pointercancel", handlePointerOut);
  }

  linkNoteEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const content = getFootnoteContent(footnoteId);
    if (!content) return;
    if (getGlobalEditModeActive()) {
      openNoteEditModal(footnoteId, content);
    } else {
      openFootnoteModal(content);
    }
  });
}
