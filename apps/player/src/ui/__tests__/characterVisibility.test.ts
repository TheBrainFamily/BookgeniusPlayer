/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";

import {
  collectVisibleCharacterSlugs,
  extractSpeakerSlugs,
  getParagraphElementsInVisibleRange,
  isInlineMentionVisible,
  isRectIntersectingViewport,
  parseSpeakerSlugs,
} from "../characterVisibility";

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

describe("characterVisibility", () => {
  it("parses speaker slugs from spaces and commas", () => {
    expect(parseSpeakerSlugs("alice bob,carol")).toEqual(["alice", "bob", "carol"]);
    expect(parseSpeakerSlugs(null)).toEqual([]);
  });

  it("detects viewport intersection with minimum overlap", () => {
    const viewport = makeRect({ top: 100, bottom: 300 });
    const visibleRect = makeRect({ top: 150, bottom: 220 });
    const outsideRect = makeRect({ top: 310, bottom: 360 });

    expect(isRectIntersectingViewport(visibleRect, viewport)).toBe(true);
    expect(isRectIntersectingViewport(outsideRect, viewport)).toBe(false);
  });

  it("uses line boxes for inline mention visibility", () => {
    const mention = document.createElement("span");
    const viewport = makeRect({ top: 100, bottom: 300 });

    setMentionClientRects(mention, [makeRect({ top: 120, bottom: 132 })]);
    expect(isInlineMentionVisible(mention, viewport)).toBe(true);

    setMentionClientRects(mention, [makeRect({ top: 320, bottom: 340 })]);
    expect(isInlineMentionVisible(mention, viewport)).toBe(false);
  });

  it("collects paragraphs within chapter/paragraph range boundaries", () => {
    document.body.innerHTML = `
      <div id="content-container">
        <section data-chapter="6">
          <p data-index="20">A</p>
          <p data-index="21">B</p>
        </section>
        <section data-chapter="7">
          <p data-index="0">C</p>
          <p data-index="1">D</p>
        </section>
      </div>
    `;

    const contentContainer = document.getElementById("content-container") as HTMLElement;
    const paragraphs = getParagraphElementsInVisibleRange(contentContainer, {
      earliestVisibleChapter: 6,
      earliestVisibleParagraph: 21,
      latestVisibleChapter: 7,
      latestVisibleParagraph: 0,
    });

    expect(paragraphs.map((el) => el.getAttribute("data-index"))).toEqual(["21", "0"]);
  });

  it("extracts speaker slugs from direct and ancestor speaker metadata", () => {
    document.body.innerHTML = `
      <div data-speaker="robert-walton">
        <p data-index="10" id="paragraph" data-speaker="mrs-saville"></p>
      </div>
    `;

    const paragraph = document.getElementById("paragraph") as HTMLElement;
    const speakers = extractSpeakerSlugs(paragraph);

    expect(Array.from(speakers).sort()).toEqual(["mrs-saville", "robert-walton"]);
  });

  it("collects visible speaker and mention slugs from visible paragraphs only", () => {
    document.body.innerHTML = `
      <div id="content-container">
        <section data-chapter="6">
          <p data-index="30" id="p-visible" data-speaker="robert-walton">
            I saw <span id="mention-visible" data-c="mrs-saville" data-character="mrs-saville">Margaret</span>.
          </p>
          <p data-index="31" id="p-hidden">
            <span id="mention-hidden" data-c="uncle-thomas" data-character="uncle-thomas">uncle Thomas</span>
          </p>
        </section>
      </div>
    `;

    const contentContainer = document.getElementById("content-container") as HTMLElement;
    const visibleParagraph = document.getElementById("p-visible") as HTMLElement;
    const hiddenParagraph = document.getElementById("p-hidden") as HTMLElement;
    const visibleMention = document.getElementById("mention-visible") as HTMLElement;
    const hiddenMention = document.getElementById("mention-hidden") as HTMLElement;

    setElementRect(visibleParagraph, makeRect({ top: 120, bottom: 210 }));
    setElementRect(hiddenParagraph, makeRect({ top: 500, bottom: 560 }));
    setMentionClientRects(visibleMention, [makeRect({ top: 140, bottom: 152 })]);
    setMentionClientRects(hiddenMention, [makeRect({ top: 510, bottom: 524 })]);

    const viewport = makeRect({ top: 100, bottom: 300 });
    const paragraphs = getParagraphElementsInVisibleRange(contentContainer, {
      earliestVisibleChapter: 6,
      earliestVisibleParagraph: 30,
      latestVisibleChapter: 6,
      latestVisibleParagraph: 31,
    });
    const slugs = collectVisibleCharacterSlugs(paragraphs, viewport);

    expect(Array.from(slugs).sort()).toEqual(["mrs-saville", "robert-walton"]);
  });
});
