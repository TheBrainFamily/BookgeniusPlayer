import { expect, describe, it } from "@jest/globals";
import { normalise } from "./normalise";
import { locateQuotes, similarity } from "./locateQuotes";

describe("similarity()", () => {
  it("is 1 for identical strings", () => {
    const s = "Masz moją wdzięczność i przekonasz się, że jest coś warta";
    expect(similarity(normalise(s), normalise(s))).toBe(1);
  });

  it("is high for minor edits", () => {
    const a = "Masz moją wdzięczność i przekonasz się, że jest coś warta";
    const b = "Masz moja wdziecznosc i przekonasz sie, ze jest cos warta";
    expect(similarity(normalise(a), normalise(b))).toBeGreaterThan(0.99);
  });
});

describe("locateQuotes()", () => {
  const para = {
    chapter: 1,
    index: 42,
    raw: "Masz moją wdzięczność i przekonasz się, że jest coś warta",
    norm: normalise("Masz moją wdzięczność i przekonasz się, że jest coś warta"),
  };

  it("finds the correct paragraph", () => {
    const hits = locateQuotes(['"Masz moją wdzięczność i przekonasz się, że jest coś warta"'], [para], { chapter: 1, paragraph: 999 });
    expect(hits.length).toBe(1);
    expect(hits[0].chapter).toBe(1);
    expect(hits[0].index).toBe(42);
    expect(hits[0].score).toBeGreaterThan(0.9);
  });

  describe("similarity() – punctuation/whitespace vs real edits", () => {
    /* Helper: just wrap calls in normalise() so tests reflect production code */
    const sim = (a: string, b: string) => similarity(normalise(a), normalise(b));

    /** 1 ▸ commas & dashes are ignored ---------------------------------- */
    it("ignores commas, dashes and quotes", () => {
      const a = 'Powiedział: "Zrób to – natychmiast!"';
      const b = "Powiedzial Zrob to natychmiast";
      expect(sim(a, b)).toBeGreaterThan(0.99); // ≈ 1.0
    });

    /** 2 ▸ multiple spaces are ignored ---------------------------------- */
    it("ignores extra / missing spaces", () => {
      const a = "Masz   moją   wdzięczność";
      const b = "Masz moją wdzięczność";
      expect(sim(a, b)).toBeGreaterThan(0.99);
    });
    it("penalises numeric changes", () => {
      const a = "Zebraliśmy 200 talentów srebra";
      const b = "Zebraliśmy 300 talentów srebra";
      expect(sim(a, b)).toBeLessThan(0.9); // not identical
    });

    /** 3 ▸ real letter difference is penalised -------------------------- */
    it("penalises a single missing word", () => {
      const a = "Masz moją wdzięczność i przekonasz się, że jest coś warta";
      const b = "Masz moją wdzięczność";
      expect(sim(a, b)).toBeLessThan(0.8); // big drop
    });

    /** 4 ▸ numeric change is penalised ---------------------------------- */

    /** 5 ▸ accent loss + punctuation still 1.0 -------------------------- */
    it("treats accent loss + commas as identical (regression)", () => {
      const a = "Masz moją wdzięczność i przekonasz się, że jest coś warta";
      const b = "Masz moja wdziecznosc i przekonasz sie, ze jest cos warta";
      expect(sim(a, b)).toBeGreaterThan(0.99);
    });
  });
});
