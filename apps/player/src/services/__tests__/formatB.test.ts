/**
 * @vitest-environment jsdom
 *
 * Format B Tests
 *
 * Format B is a more compact HTML storage format where speaker blocks are
 * wrapped in a single div with data-speaker and data-label attributes:
 *
 * <div data-speaker="roderigo" data-label="RODERIGO">
 *   <p>Line 1</p>
 *   <p>Line 2</p>
 * </div>
 *
 * This should produce the same rendered output as the verbose format:
 *
 * <div class="play-row" data-speaker="roderigo" data-text-alignment="left">
 *   <div class="character-avatar">...</div>
 *   <div class="character-text">
 *     <p data-is-character="true"><strong>RODERIGO</strong></p>
 *     <p>Line 1</p>
 *     <p>Line 2</p>
 *   </div>
 * </div>
 */
import { describe, it, expect } from "vitest";
import { normalizeChapterHtml } from "../htmlNormalizer";

// Current verbose format (what we store now)
const VERBOSE_FORMAT = `<section data-chapter="1">
  <h3 data-act="true">ACT I</h3>
  <h4>SCENE I.</h4>
  <h5>Venice. A street.</h5>
  <div class="play-row didaskalia-row">
    <div class="didaskalia-text">
      <p data-is-didaskalia="true">
        <span id="ch1-p0-s1"><em>Enter <span data-enters="true" data-c="roderigo">RODERIGO</span> and <span data-enters="true" data-c="iago">IAGO</span></em></span>
      </p>
    </div>
  </div>
  <div data-speaker="roderigo" class="play-row" data-text-alignment="left">
    <div class="character-avatar"></div>
    <div class="character-text">
      <p data-text-alignment="left" data-is-character="true" data-is-didaskalia="false">
        <span id="ch1-p1-s1"><strong>RODERIGO</strong></span>
      </p>
      <p data-text-alignment="left" data-is-character="false" data-is-didaskalia="false">
        <span id="ch1-p2-s1">Tush! never tell me; I take it much unkindly</span>
      </p>
      <p data-text-alignment="left" data-is-character="false" data-is-didaskalia="false">
        <span id="ch1-p3-s1">That thou, <span data-c="iago">Iago</span>, who hast had my purse</span>
      </p>
    </div>
  </div>
  <div data-speaker="iago" class="play-row" data-text-alignment="right">
    <div class="character-avatar"></div>
    <div class="character-text">
      <p data-text-alignment="right" data-is-character="true" data-is-didaskalia="false">
        <span id="ch1-p5-s1"><strong>IAGO</strong></span>
      </p>
      <p data-text-alignment="right" data-is-character="false" data-is-didaskalia="false">
        <span id="ch1-p6-s1">'Sblood, but you will not hear me:</span>
      </p>
    </div>
  </div>
</section>`;

// New compact format B (what we want to store)
const FORMAT_B = `<section data-chapter="1">
  <h3 data-act="true">ACT I</h3>
  <h4>SCENE I.</h4>
  <h5>Venice. A street.</h5>
  <p data-is-didaskalia="true">
    <span id="ch1-p0-s1"><em>Enter <span data-enters="true" data-c="roderigo">RODERIGO</span> and <span data-enters="true" data-c="iago">IAGO</span></em></span>
  </p>
  <div data-speaker="roderigo" data-label="RODERIGO">
    <p><span id="ch1-p2-s1">Tush! never tell me; I take it much unkindly</span></p>
    <p><span id="ch1-p3-s1">That thou, <span data-c="iago">Iago</span>, who hast had my purse</span></p>
  </div>
  <div data-speaker="iago" data-label="IAGO">
    <p><span id="ch1-p6-s1">'Sblood, but you will not hear me:</span></p>
  </div>
</section>`;

describe("Format B", () => {
  describe("basic structure transformation", () => {
    it("transforms speaker div into play-row with avatar and character-text", () => {
      const input = `<section data-chapter="1">
        <div data-speaker="bob" data-label="BOB">
          <p>Hello world</p>
        </div>
      </section>`;

      const result = normalizeChapterHtml(input);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const playRow = doc.querySelector(".play-row");
      expect(playRow).toBeTruthy();
      expect(playRow?.querySelector(".character-avatar")).toBeTruthy();
      expect(playRow?.querySelector(".character-text")).toBeTruthy();
      expect(playRow?.getAttribute("data-speaker")).toBe("bob");
    });

    it("creates speaker label from data-label attribute", () => {
      const input = `<section data-chapter="1">
        <div data-speaker="bob" data-label="BOBBY">
          <p>Hello world</p>
        </div>
      </section>`;

      const result = normalizeChapterHtml(input);

      expect(result).toContain("<strong>BOBBY</strong>");
      expect(result).toContain('data-is-character="true"');
    });

    it("handles multiple paragraphs in one speaker block", () => {
      const input = `<section data-chapter="1">
        <div data-speaker="bob" data-label="BOB">
          <p>Line one</p>
          <p>Line two</p>
          <p>Line three</p>
        </div>
      </section>`;

      const result = normalizeChapterHtml(input);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      // Should have 4 paragraphs: 1 label + 3 content
      const paragraphs = doc.querySelectorAll(".character-text p");
      expect(paragraphs.length).toBe(4);

      // First paragraph is the label
      expect(paragraphs[0].getAttribute("data-is-character")).toBe("true");

      // Rest are content
      expect(paragraphs[1].textContent).toContain("Line one");
      expect(paragraphs[2].textContent).toContain("Line two");
      expect(paragraphs[3].textContent).toContain("Line three");
    });

    it("alternates text alignment between speakers", () => {
      const input = `<section data-chapter="1">
        <div data-speaker="alice" data-label="ALICE"><p>Hi</p></div>
        <div data-speaker="bob" data-label="BOB"><p>Hello</p></div>
        <div data-speaker="alice" data-label="ALICE"><p>Bye</p></div>
      </section>`;

      const result = normalizeChapterHtml(input);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const playRows = doc.querySelectorAll(".play-row");
      expect(playRows[0].getAttribute("data-text-alignment")).toBe("left");
      expect(playRows[1].getAttribute("data-text-alignment")).toBe("right");
      expect(playRows[2].getAttribute("data-text-alignment")).toBe("left");
    });
  });

  describe("didaskalia (stage directions)", () => {
    it("wraps didaskalia paragraphs in didaskalia-row", () => {
      const input = `<section data-chapter="1">
        <p data-is-didaskalia="true"><em>Enter all.</em></p>
      </section>`;

      const result = normalizeChapterHtml(input);

      expect(result).toContain("didaskalia-row");
      expect(result).toContain("didaskalia-text");
    });

    it("handles pure em paragraphs as stage directions", () => {
      const input = `<section data-chapter="1">
        <p><em>Enter ROMEO and JULIET.</em></p>
      </section>`;

      const result = normalizeChapterHtml(input);

      // Pure em paragraphs should become didaskalia
      expect(result).toContain('data-is-didaskalia="true"');
    });

    it("marks pure em paragraphs inside format B speaker blocks as didaskalia", () => {
      const input = `<section data-chapter="1">
        <div data-speaker="macbeth" data-label="MACBETH">
          <p>To know my deed, 'twere best not know myself.</p>
          <p><em>Knocking within</em></p>
          <p>Wake Duncan with thy knocking! I would thou couldst!</p>
        </div>
      </section>`;

      const result = normalizeChapterHtml(input);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      const didaskalia = Array.from(doc.querySelectorAll(".character-text p")).find((p) =>
        p.textContent?.includes("Knocking within"),
      );

      expect(didaskalia?.getAttribute("data-is-didaskalia")).toBe("true");
    });
  });

  describe("data-index injection", () => {
    it("adds sequential data-index to all indexable elements", () => {
      const input = `<section data-chapter="1">
        <h3>Act I</h3>
        <h4>Scene I</h4>
        <div data-speaker="bob" data-label="BOB">
          <p>Line one</p>
          <p>Line two</p>
        </div>
      </section>`;

      const result = normalizeChapterHtml(input);
      const parser = new DOMParser();
      const doc = parser.parseFromString(result, "text/html");

      // h3 = 0, h4 = 1, label p = 2, content p = 3, 4
      expect(doc.querySelector("h3")?.getAttribute("data-index")).toBe("0");
      expect(doc.querySelector("h4")?.getAttribute("data-index")).toBe("1");

      const paragraphs = doc.querySelectorAll(".character-text p");
      expect(paragraphs[0].getAttribute("data-index")).toBe("2"); // label
      expect(paragraphs[1].getAttribute("data-index")).toBe("3"); // line one
      expect(paragraphs[2].getAttribute("data-index")).toBe("4"); // line two
    });
  });

  describe("character mentions", () => {
    it("preserves data-c spans with enters/exits attributes", () => {
      const input = `<section data-chapter="1">
        <p data-is-didaskalia="true">
          <em>Enter <span data-c="bob" data-enters="true">Bob</span>.</em>
        </p>
      </section>`;

      const result = normalizeChapterHtml(input);

      expect(result).toContain('data-c="bob"');
      expect(result).toContain('data-enters="true"');
      expect(result).toContain('data-character="bob"');
    });
  });

  describe("format equivalence", () => {
    it("produces structurally equivalent output as verbose format", () => {
      const verboseResult = normalizeChapterHtml(VERBOSE_FORMAT);
      const formatBResult = normalizeChapterHtml(FORMAT_B);

      const parser = new DOMParser();
      const verboseDoc = parser.parseFromString(verboseResult, "text/html");
      const formatBDoc = parser.parseFromString(formatBResult, "text/html");

      // Same number of play-rows
      const verbosePlayRows = verboseDoc.querySelectorAll(".play-row");
      const formatBPlayRows = formatBDoc.querySelectorAll(".play-row");
      expect(formatBPlayRows.length).toBe(verbosePlayRows.length);

      // Same speakers in same order
      const verboseSpeakers = Array.from(verbosePlayRows).map((r) =>
        r.getAttribute("data-speaker"),
      );
      const formatBSpeakers = Array.from(formatBPlayRows).map((r) =>
        r.getAttribute("data-speaker"),
      );
      expect(formatBSpeakers).toEqual(verboseSpeakers);

      // Same text alignments
      const verboseAlignments = Array.from(verbosePlayRows).map((r) =>
        r.getAttribute("data-text-alignment"),
      );
      const formatBAlignments = Array.from(formatBPlayRows).map((r) =>
        r.getAttribute("data-text-alignment"),
      );
      expect(formatBAlignments).toEqual(verboseAlignments);

      // Same headings
      expect(formatBDoc.querySelector("h3")?.textContent).toBe(
        verboseDoc.querySelector("h3")?.textContent,
      );
      expect(formatBDoc.querySelector("h4")?.textContent).toBe(
        verboseDoc.querySelector("h4")?.textContent,
      );

      // Character mentions preserved with enters/exits
      const verboseEnters = verboseDoc.querySelectorAll('[data-enters="true"]');
      const formatBEnters = formatBDoc.querySelectorAll('[data-enters="true"]');
      expect(formatBEnters.length).toBe(verboseEnters.length);
    });
  });
});
