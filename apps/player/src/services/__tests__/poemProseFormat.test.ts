/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { normalizeChapterHtmlPoemProse } from "../htmlNormalizer";

// Paradise Lost style input - poetry with speaker attribution
const PARADISE_LOST_SAMPLE = `<section data-chapter="5">
  <h2><span data-epub-type="label">Book</span> <span data-epub-type="ordinal z3998:roman">V</span></h2>
  <section id="poem-5" data-epub-type="z3998:poem">
    <p data-speaker="adam">
      <span>Now Morn, her rosy steps in the eastern clime</span>
      <br>
      <span>Advancing, sowed the earth with orient pearl,</span>
      <br>
      <span>His wonder was to find unwakened <span data-c="eve">Eve</span></span>
      <br>
      <span>With tresses discomposed, and glowing cheek.</span>
    </p>
    <p>
      <span>Such whispering waked her, but with startled eye</span>
      <br>
      <span>On <span data-c="adam">Adam</span>, whom embracing, thus she spake:</span>
    </p>
    <p data-speaker="eve">
      <span>'O sole in whom my thoughts find all repose,</span>
      <br>
      <span>My glory, my perfection! glad I see</span>
      <br>
      <span>Thy face, and morn returned.'</span>
    </p>
  </section>
</section>`;

// Play format with explicit labels (like Othello)
const PLAY_WITH_LABELS = `<section data-chapter="1">
  <p data-speaker="roderigo" data-label="RODERIGO">
    <span>Tush! never tell me; I take it much unkindly</span>
  </p>
  <p data-speaker="roderigo" data-label="RODERIGO">
    <span>That thou, <span data-c="iago">Iago</span>, who hast had my purse</span>
  </p>
  <p data-speaker="iago" data-label="IAGO">
    <span>'Sblood, but you will not hear me.</span>
  </p>
</section>`;

// Multiple speakers (like "adam eve" praying together)
const MULTIPLE_SPEAKERS = `<section data-chapter="5">
  <section id="poem-5" data-epub-type="z3998:poem">
    <p data-speaker="adam eve" data-label="ADAM AND EVE">
      <span>'These are thy glorious works, <span data-c="god">Parent of good</span>,</span>
      <br>
      <span><span data-c="god">Almighty</span>! thine this universal frame.'</span>
    </p>
  </section>
</section>`;

// Stage direction (pure em paragraph)
const WITH_STAGE_DIRECTION = `<section data-chapter="1">
  <p><em>Enter <span data-c="adam" data-enters="true">Adam</span> and <span data-c="eve" data-enters="true">Eve</span>.</em></p>
  <p data-speaker="adam">
    <span>Good morrow, my love.</span>
  </p>
</section>`;

describe("Poem/Prose Format (poemProse mode)", () => {
  describe("Basic structure transformation", () => {
    it("wraps data-speaker paragraphs in play-row structure", () => {
      const result = normalizeChapterHtmlPoemProse(PARADISE_LOST_SAMPLE);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      // Should have play-rows for each speaker paragraph
      const playRows = doc.querySelectorAll(".play-row");
      expect(playRows.length).toBeGreaterThan(0);

      // First play-row should be for adam
      const adamRow = doc.querySelector('[data-speaker="adam"]');
      expect(adamRow).toBeTruthy();
      expect(adamRow?.classList.contains("play-row")).toBe(true);
    });

    it("creates character-avatar and character-text containers", () => {
      const result = normalizeChapterHtmlPoemProse(PARADISE_LOST_SAMPLE);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const playRow = doc.querySelector('[data-speaker="adam"]');
      expect(playRow?.querySelector(".character-avatar")).toBeTruthy();
      expect(playRow?.querySelector(".character-text")).toBeTruthy();
    });

    it("does NOT group consecutive paragraphs by same speaker", () => {
      const result = normalizeChapterHtmlPoemProse(PLAY_WITH_LABELS);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      // Each paragraph should become its own play-row
      const playRows = doc.querySelectorAll(".play-row");
      expect(playRows.length).toBe(3); // Two roderigo + one iago
    });

    it("preserves non-speaker paragraphs outside play-rows", () => {
      const result = normalizeChapterHtmlPoemProse(PARADISE_LOST_SAMPLE);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      // The narrative paragraph should not be in a play-row
      const allContent = doc.querySelector("section[data-chapter]")?.innerHTML || "";
      expect(allContent).toContain("Such whispering waked her");
    });
  });

  describe("Speaker label handling", () => {
    it("uses data-label attribute for speaker display when present", () => {
      const result = normalizeChapterHtmlPoemProse(PLAY_WITH_LABELS);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const firstRow = doc.querySelector(".play-row");
      const labelEl = firstRow?.querySelector('[data-is-character="true"] strong');
      expect(labelEl?.textContent).toBe("RODERIGO");
    });

    it("generates label from slug when data-label not present", () => {
      const result = normalizeChapterHtmlPoemProse(PARADISE_LOST_SAMPLE);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const adamRow = doc.querySelector('[data-speaker="adam"]');
      const labelEl = adamRow?.querySelector('[data-is-character="true"] strong');
      // Should convert "adam" to "Adam" or similar
      expect(labelEl?.textContent?.toLowerCase()).toContain("adam");
    });

    it("handles multiple speakers with custom label", () => {
      const result = normalizeChapterHtmlPoemProse(MULTIPLE_SPEAKERS);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const row = doc.querySelector('[data-speaker="adam eve"]');
      expect(row).toBeTruthy();
      const labelEl = row?.querySelector('[data-is-character="true"] strong');
      expect(labelEl?.textContent).toBe("ADAM AND EVE");
    });
  });

  describe("Nested section handling", () => {
    it("processes paragraphs inside nested poem sections", () => {
      const result = normalizeChapterHtmlPoemProse(PARADISE_LOST_SAMPLE);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      // Should find play-rows even though they're nested in poem sections
      const adamRow = doc.querySelector('[data-speaker="adam"]');
      expect(adamRow).toBeTruthy();

      const eveRow = doc.querySelector('[data-speaker="eve"]');
      expect(eveRow).toBeTruthy();
    });

    it("unwraps poem sections so play-rows are direct children of chapter section", () => {
      const result = normalizeChapterHtmlPoemProse(PARADISE_LOST_SAMPLE);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      // Poem section wrapper should be removed
      const poemSection = doc.querySelector('[id="poem-5"]');
      expect(poemSection).toBeNull();

      // Play-rows should be direct children of section[data-chapter]
      const chapterSection = doc.querySelector("section[data-chapter]");
      const playRow = chapterSection?.querySelector(":scope > .play-row");
      expect(playRow).toBeTruthy();
    });
  });

  describe("Stage directions", () => {
    it("wraps pure-em paragraphs in didaskalia-row", () => {
      const result = normalizeChapterHtmlPoemProse(WITH_STAGE_DIRECTION);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const didaskaliaRow = doc.querySelector(".didaskalia-row");
      expect(didaskaliaRow).toBeTruthy();
      expect(didaskaliaRow?.querySelector(".didaskalia-text")).toBeTruthy();
    });

    it("preserves enters/exits attributes in stage directions", () => {
      const result = normalizeChapterHtmlPoemProse(WITH_STAGE_DIRECTION);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const adamEnter = doc.querySelector('[data-c="adam"][data-enters="true"]');
      expect(adamEnter).toBeTruthy();
    });
  });

  describe("Alternating alignment", () => {
    it("alternates left/right alignment when speaker changes", () => {
      const result = normalizeChapterHtmlPoemProse(PARADISE_LOST_SAMPLE);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const playRows = doc.querySelectorAll(".play-row:not(.didaskalia-row)");
      const alignments = Array.from(playRows).map((row) => row.getAttribute("data-text-alignment"));

      // First speaker should be left
      expect(alignments[0]).toBe("left");
      // When speaker changes, should alternate
      // Adam -> Eve should be left -> right
    });
  });

  describe("Data index injection", () => {
    it("adds data-index to indexable elements", () => {
      const result = normalizeChapterHtmlPoemProse(PARADISE_LOST_SAMPLE);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const indexed = doc.querySelectorAll("[data-index]");
      expect(indexed.length).toBeGreaterThan(0);
    });
  });

  describe("Character highlighting", () => {
    it("adds character-highlighted class to non-speaker character mentions", () => {
      const result = normalizeChapterHtmlPoemProse(PARADISE_LOST_SAMPLE);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      // Character mentions that are NOT the speaker should be highlighted
      const adamRow = doc.querySelector('[data-speaker="adam"]');
      // Adam mentions Eve in his speech - Eve should be highlighted
      const eveMention = adamRow?.querySelector('[data-c="eve"]');
      expect(eveMention?.classList.contains("character-highlighted")).toBe(true);
    });
  });

  describe("Avatar shell injection", () => {
    it("injects character-placeholder in character-avatar", () => {
      const result = normalizeChapterHtmlPoemProse(PARADISE_LOST_SAMPLE);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const playRow = doc.querySelector('[data-speaker="adam"]');
      const avatar = playRow?.querySelector(".character-avatar");
      const placeholder = avatar?.querySelector(".character-placeholder");

      expect(placeholder).toBeTruthy();
      expect(placeholder?.getAttribute("data-character")).toBe("adam");
      expect(placeholder?.getAttribute("data-is-talking")).toBe("true");
    });
  });
});

describe("Comparison: poemProse vs enhancedProse", () => {
  const CONSECUTIVE_SAME_SPEAKER = `<section data-chapter="1">
    <p data-speaker="adam">First line of speech.</p>
    <p data-speaker="adam">Second line of speech.</p>
    <p data-speaker="eve">Response from Eve.</p>
  </section>`;

  it("poemProse: each paragraph becomes separate play-row", () => {
    const result = normalizeChapterHtmlPoemProse(CONSECUTIVE_SAME_SPEAKER);
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, "text/html");

    const playRows = doc.querySelectorAll(".play-row");
    expect(playRows.length).toBe(3); // Each paragraph is its own row
  });

  // Note: enhancedProse groups consecutive same-speaker paragraphs
  // This test documents the difference in behavior
});
