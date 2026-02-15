/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { useCharacterNotes } from "../useCharacterNotes";
import type { Location } from "@player/state/LocationContext";

const mockGetCharactersMetadataForParagraphRange = vi.fn();
const mockParseParagraphRange = vi.fn();
const mockUseBookConvex = vi.fn();

vi.mock("@player/fetchers/getParagraphRange", () => ({
  paragraphMetadataServicePure: {
    getCharactersMetadataForParagraphRange: (...args: unknown[]) =>
      mockGetCharactersMetadataForParagraphRange(...args),
  },
  parseParagraphRange: (...args: unknown[]) => mockParseParagraphRange(...args),
}));

vi.mock("@player/context/BookConvexContext", () => ({ useBookConvex: () => mockUseBookConvex() }));

type RectInit = { top: number; bottom: number; left?: number; right?: number };

function makeRect({ top, bottom, left = 0, right = 100 }: RectInit): DOMRect {
  return {
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function setElementRect(element: Element, rect: DOMRect): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
}

function setMentionClientRects(element: Element, rects: DOMRect[]): void {
  Object.defineProperty(element, "getClientRects", { configurable: true, value: () => rects });
}

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    chapter: 6,
    paragraph: 10,
    endChapter: 6,
    endParagraph: 11,
    currentChapter: 6,
    currentParagraph: 10,
    earliestVisibleChapter: 6,
    earliestVisibleParagraph: 10,
    latestVisibleChapter: 6,
    latestVisibleParagraph: 11,
    ...overrides,
  };
}

function makeNote(slug: string) {
  return {
    slug,
    characterName: slug,
    summary: `${slug} summary`,
    imageUrl: `https://example.com/${slug}.webp`,
    paragraphNumber: 10,
    isTalkingInFirstParagraph: false,
    chapterNumber: 6,
    label: slug,
    otherAppearances: [],
  };
}

describe("useCharacterNotes integration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    mockUseBookConvex.mockReturnValue({ charactersData: [], bookData: { slug: "test-book" } });
    mockGetCharactersMetadataForParagraphRange.mockReturnValue([]);
    mockParseParagraphRange.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("filters out characters whose mention is below the fold while keeping visible speaker + mention", async () => {
    document.body.innerHTML = `
      <div id="content-container">
        <section data-chapter="6">
          <p data-index="10" id="p-visible" data-speaker="robert-walton">
            I write to <span id="mention-visible" data-c="mrs-saville" data-character="mrs-saville">Margaret</span>.
          </p>
          <p data-index="11" id="p-hidden">
            Our <span id="mention-hidden" data-c="uncle-thomas" data-character="uncle-thomas">uncle Thomas</span> has books.
          </p>
        </section>
      </div>
    `;

    const contentContainer = document.getElementById("content-container") as HTMLElement;
    const visibleParagraph = document.getElementById("p-visible") as HTMLElement;
    const hiddenParagraph = document.getElementById("p-hidden") as HTMLElement;
    const visibleMention = document.getElementById("mention-visible") as HTMLElement;
    const hiddenMention = document.getElementById("mention-hidden") as HTMLElement;

    setElementRect(contentContainer, makeRect({ top: 100, bottom: 300, left: 0, right: 600 }));
    setElementRect(visibleParagraph, makeRect({ top: 120, bottom: 220, left: 20, right: 560 }));
    setElementRect(hiddenParagraph, makeRect({ top: 520, bottom: 620, left: 20, right: 560 }));
    setMentionClientRects(visibleMention, [
      makeRect({ top: 150, bottom: 162, left: 100, right: 220 }),
    ]);
    setMentionClientRects(hiddenMention, [
      makeRect({ top: 560, bottom: 572, left: 100, right: 250 }),
    ]);

    mockParseParagraphRange.mockReturnValue([
      makeNote("robert-walton"),
      makeNote("mrs-saville"),
      makeNote("uncle-thomas"),
    ]);

    const { result } = renderHook(() => useCharacterNotes(makeLocation(), false, true));

    await waitFor(() => {
      const slugs = result.current.map((note) => note.slug).sort();
      expect(slugs).toEqual(["mrs-saville", "robert-walton"]);
    });
  });

  it("keeps note briefly after mention leaves viewport, then removes it after grace window", async () => {
    let nowMs = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);

    document.body.innerHTML = `
      <div id="content-container">
        <section data-chapter="6">
          <p data-index="10" id="p-visible">
            I need a friend: <span id="mention" data-c="uncle-thomas" data-character="uncle-thomas">uncle Thomas</span>.
          </p>
        </section>
      </div>
    `;

    const contentContainer = document.getElementById("content-container") as HTMLElement;
    const visibleParagraph = document.getElementById("p-visible") as HTMLElement;
    const mention = document.getElementById("mention") as HTMLElement;

    setElementRect(contentContainer, makeRect({ top: 100, bottom: 300, left: 0, right: 600 }));
    setElementRect(visibleParagraph, makeRect({ top: 120, bottom: 220, left: 20, right: 560 }));
    setMentionClientRects(mention, [makeRect({ top: 150, bottom: 162, left: 100, right: 250 })]);

    mockParseParagraphRange.mockReturnValue([makeNote("uncle-thomas")]);

    const initialLoc = makeLocation({ endParagraph: 10, latestVisibleParagraph: 10 });
    const { result, rerender } = renderHook(
      ({ loc }: { loc: Location }) => useCharacterNotes(loc, false, true),
      { initialProps: { loc: initialLoc } },
    );

    await waitFor(() => {
      expect(result.current.map((note) => note.slug)).toEqual(["uncle-thomas"]);
    });

    // Mention scrolls below fold, paragraph remains visible.
    setMentionClientRects(mention, [makeRect({ top: 330, bottom: 344, left: 100, right: 250 })]);
    act(() => {
      rerender({ loc: { ...initialLoc, currentParagraph: 11 } });
    });

    await waitFor(() => {
      expect(result.current.map((note) => note.slug)).toEqual(["uncle-thomas"]);
    });

    nowMs += 301;
    act(() => {
      rerender({ loc: { ...initialLoc, currentParagraph: 12 } });
    });

    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });
});
