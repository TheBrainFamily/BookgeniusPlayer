import { useCallback, useEffect, useRef, useState } from "react";

import {
  paragraphMetadataServicePure,
  parseParagraphRange,
  type ParsedParagraphRange,
} from "@player/fetchers/getParagraphRange";
import { type Location } from "@player/state/LocationContext";
import { useBookConvex } from "@player/context/BookConvexContext";
import {
  collectVisibleCharacterSlugs,
  getContentViewportRect,
  getParagraphElementsInVisibleRange,
} from "@player/ui/characterVisibility";

const CHARACTER_VISIBILITY_GRACE_MS = 300;

/** Deep equality check using JSON - compares ALL fields */
function notesEqual(a: ParsedParagraphRange[], b: ParsedParagraphRange[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeNotes(
  previousNotes: ParsedParagraphRange[],
  nextNotes: ParsedParagraphRange[],
  addNewAtEnd: boolean,
  sortAlphabetically: boolean,
): ParsedParagraphRange[] {
  if (!addNewAtEnd) {
    // Simple mode: return previous if nothing changed, otherwise replace.
    return notesEqual(previousNotes, nextNotes) ? previousNotes : nextNotes;
  }

  if (previousNotes.length === 0) {
    return sortAlphabetically
      ? [...nextNotes].sort((a, b) => a.slug.localeCompare(b.slug))
      : nextNotes;
  }

  // Preserve order for existing characters and append newly visible ones.
  const existingSlugs = new Set(previousNotes.map((note) => note.slug));
  const remaining = previousNotes.filter((note) =>
    nextNotes.some((next) => next.slug === note.slug),
  );
  const newCharacters = nextNotes.filter((note) => !existingSlugs.has(note.slug));

  // Refresh existing notes with latest metadata.
  const refreshedRemaining = remaining.map(
    (oldNote) => nextNotes.find((next) => next.slug === oldNote.slug) ?? oldNote,
  );
  const appended = sortAlphabetically
    ? [...newCharacters].sort((a, b) => a.slug.localeCompare(b.slug))
    : newCharacters;
  const merged = [...refreshedRemaining, ...appended];

  return notesEqual(previousNotes, merged) ? previousNotes : merged;
}

function filterNotesToVisibleCharacters(
  rawNotes: ParsedParagraphRange[],
  loc: Location,
  lastSeenBySlug: Map<string, number>,
): ParsedParagraphRange[] {
  if (rawNotes.length === 0) {
    lastSeenBySlug.clear();
    return [];
  }

  const contentContainer = document.getElementById("content-container");
  if (!contentContainer) {
    return rawNotes;
  }

  const paragraphElements = getParagraphElementsInVisibleRange(contentContainer, {
    earliestVisibleChapter: loc.earliestVisibleChapter,
    earliestVisibleParagraph: loc.earliestVisibleParagraph,
    latestVisibleChapter: loc.latestVisibleChapter,
    latestVisibleParagraph: loc.latestVisibleParagraph,
  });

  // During virtualization swaps, visible paragraphs can briefly disappear.
  // Keep current behavior by falling back to raw notes in that transient state.
  if (paragraphElements.length === 0) {
    return rawNotes;
  }

  const visibleSlugsNow = collectVisibleCharacterSlugs(
    paragraphElements,
    getContentViewportRect(contentContainer),
  );

  const noteSlugs = new Set(rawNotes.map((note) => note.slug));
  const now = Date.now();

  for (const slug of Array.from(lastSeenBySlug.keys())) {
    if (!noteSlugs.has(slug)) {
      lastSeenBySlug.delete(slug);
    }
  }

  visibleSlugsNow.forEach((slug) => {
    if (noteSlugs.has(slug)) {
      lastSeenBySlug.set(slug, now);
    }
  });

  const visibleWithGrace = new Set<string>();
  visibleSlugsNow.forEach((slug) => {
    if (noteSlugs.has(slug)) {
      visibleWithGrace.add(slug);
    }
  });

  for (const [slug, lastSeenAt] of lastSeenBySlug.entries()) {
    if (now - lastSeenAt <= CHARACTER_VISIBILITY_GRACE_MS) {
      visibleWithGrace.add(slug);
      continue;
    }
    lastSeenBySlug.delete(slug);
  }

  return rawNotes.filter((note) => visibleWithGrace.has(note.slug));
}

/**
 * @param loc                 current paragraph-range location
 * @param addNewAtEnd         if true, keeps existing order and appends new chars;
 *                            if false, just replaces list on any change
 * @param sortAlphabetically  when appending, whether to sort the new items (and initial load) alphabetically
 */
export function useCharacterNotes(
  loc: Location,
  addNewAtEnd = false,
  sortAlphabetically = true,
): ParsedParagraphRange[] {
  const [rawNotes, setRawNotes] = useState<ParsedParagraphRange[]>([]);
  const [notes, setNotes] = useState<ParsedParagraphRange[]>([]);
  const { charactersData, bookData } = useBookConvex();
  const bookSlug = bookData?.slug ?? "";
  const lastSeenBySlugRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;

    function load() {
      const { chapter, paragraph, endChapter, endParagraph } = loc;

      const raw = paragraphMetadataServicePure.getCharactersMetadataForParagraphRange(
        { bookSlug, startChapter: chapter, startParagraph: paragraph, endChapter, endParagraph },
        charactersData,
      );

      if (cancelled) return;

      const parsed = parseParagraphRange(raw);
      setRawNotes((prev) => (notesEqual(prev, parsed) ? prev : parsed));
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- INTENTIONAL: loc object excluded, using destructured properties instead to avoid re-running on unrelated location changes (like scrollY).
  }, [
    loc.chapter,
    loc.paragraph,
    loc.endChapter,
    loc.endParagraph,
    addNewAtEnd,
    sortAlphabetically,
    bookSlug,
    charactersData,
  ]);

  const refreshVisibleNotes = useCallback(() => {
    const filtered = filterNotesToVisibleCharacters(rawNotes, loc, lastSeenBySlugRef.current);
    setNotes((prev) => mergeNotes(prev, filtered, addNewAtEnd, sortAlphabetically));
  }, [rawNotes, loc, addNewAtEnd, sortAlphabetically]);

  useEffect(() => {
    refreshVisibleNotes();
  }, [refreshVisibleNotes]);

  useEffect(() => {
    const contentContainer = document.getElementById("content-container");
    if (!contentContainer) {
      return;
    }

    let rafId: number | null = null;
    const scheduleRefresh = () => {
      if (rafId !== null) {
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        refreshVisibleNotes();
      });
    };

    contentContainer.addEventListener("scroll", scheduleRefresh, { passive: true });
    window.addEventListener("resize", scheduleRefresh);
    window.addEventListener("orientationchange", scheduleRefresh);
    window.addEventListener("navigationComplete", scheduleRefresh);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      contentContainer.removeEventListener("scroll", scheduleRefresh);
      window.removeEventListener("resize", scheduleRefresh);
      window.removeEventListener("orientationchange", scheduleRefresh);
      window.removeEventListener("navigationComplete", scheduleRefresh);
    };
  }, [refreshVisibleNotes]);

  return notes;
}
