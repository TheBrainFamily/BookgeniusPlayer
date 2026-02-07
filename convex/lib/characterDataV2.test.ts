import { describe, it, expect } from "vitest";
import {
  extractOccurrences,
  v1ToV2,
  v2ToV1,
  mergeV2ToCharacterData,
  resolveSummary,
  buildCharacterIndex,
  type V1ChapterFragment,
  type CharacterBundle,
  type CharacterIndex,
  type ChapterOccurrences,
} from "./characterDataV2";

function normalizeV1(data: V1ChapterFragment[]): V1ChapterFragment[] {
  return data
    .map((ch) => ({
      ...ch,
      characters: ch.characters
        .map((c) => ({
          ...c,
          infoPerChapter: c.infoPerChapter.map((i) => ({
            chapter: i.chapter,
            summary: i.summary,
            paragraphsWhereSpotted: [...i.paragraphsWhereSpotted].sort((a, b) => a - b),
            paragraphsWhereTalking: [...i.paragraphsWhereTalking].sort((a, b) => a - b),
            ...(i.paragraphsWhereEnters?.length
              ? { paragraphsWhereEnters: [...i.paragraphsWhereEnters].sort((a, b) => a - b) }
              : {}),
            ...(i.paragraphsWhereExits?.length
              ? { paragraphsWhereExits: [...i.paragraphsWhereExits].sort((a, b) => a - b) }
              : {}),
          })),
        }))
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    }))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
}

describe("extractOccurrences", () => {
  it("extracts spotted and talking arrays", () => {
    const characters = [
      {
        slug: "winston",
        infoPerChapter: [
          { chapter: 1, summary: "", paragraphsWhereSpotted: [0, 5], paragraphsWhereTalking: [3] },
        ],
      },
    ];

    const result = extractOccurrences(characters, 1);

    expect(result).toEqual({ winston: { s: [0, 5], t: [3] } });
  });

  it("includes enters/exits for plays", () => {
    const characters = [
      {
        slug: "hamlet",
        infoPerChapter: [
          {
            chapter: 1,
            summary: "",
            paragraphsWhereSpotted: [10],
            paragraphsWhereTalking: [15],
            paragraphsWhereEnters: [10],
            paragraphsWhereExits: [30],
          },
        ],
      },
    ];

    const result = extractOccurrences(characters, 1);

    expect(result).toEqual({ hamlet: { s: [10], t: [15], e: [10], x: [30] } });
  });

  it("excludes characters with no occurrences in chapter", () => {
    const characters = [
      {
        slug: "winston",
        infoPerChapter: [
          { chapter: 1, summary: "", paragraphsWhereSpotted: [0], paragraphsWhereTalking: [] },
        ],
      },
      {
        slug: "julia",
        infoPerChapter: [
          { chapter: 2, summary: "", paragraphsWhereSpotted: [5], paragraphsWhereTalking: [] },
        ],
      },
    ];

    const result = extractOccurrences(characters, 1);

    expect(result).toEqual({ winston: { s: [0], t: [] } });
    expect(result["julia"]).toBeUndefined();
  });

  it("excludes characters with empty arrays", () => {
    const characters = [
      {
        slug: "ghost",
        infoPerChapter: [
          { chapter: 1, summary: "", paragraphsWhereSpotted: [], paragraphsWhereTalking: [] },
        ],
      },
    ];

    const result = extractOccurrences(characters, 1);

    expect(result).toEqual({});
  });
});

describe("v1ToV2", () => {
  it("transforms basic prose book", () => {
    const v1Chapters: V1ChapterFragment[] = [
      {
        chapterNumber: 1,
        characters: [
          {
            slug: "winston",
            characterName: "Winston Smith",
            bookSlug: "1984",
            infoPerChapter: [
              {
                chapter: 1,
                summary: "A clerk",
                paragraphsWhereSpotted: [0, 5],
                paragraphsWhereTalking: [3],
              },
            ],
          },
        ],
      },
    ];

    const bundles: CharacterBundle[] = [
      { slug: "winston", name: "Winston Smith", summary: "A clerk" },
    ];

    const { index, chapters } = v1ToV2(v1Chapters, bundles);

    expect(index.form).toBe("prose");
    expect(index.characters["winston"]).toEqual({
      name: "Winston Smith",
      summary: "A clerk",
      media: undefined,
    });
    expect(chapters[1]).toEqual({ winston: { s: [0, 5], t: [3] } });
  });

  it("detects play form from enters/exits", () => {
    const v1Chapters: V1ChapterFragment[] = [
      {
        chapterNumber: 1,
        characters: [
          {
            slug: "hamlet",
            characterName: "Hamlet",
            bookSlug: "hamlet",
            infoPerChapter: [
              {
                chapter: 1,
                summary: "Prince",
                paragraphsWhereSpotted: [10],
                paragraphsWhereTalking: [15],
                paragraphsWhereEnters: [10],
                paragraphsWhereExits: [30],
              },
            ],
          },
        ],
      },
    ];

    const bundles: CharacterBundle[] = [{ slug: "hamlet", name: "Hamlet", summary: "Prince" }];

    const { index } = v1ToV2(v1Chapters, bundles);

    expect(index.form).toBe("play");
  });

  it("detects summary overrides when chapter summary differs from bundle", () => {
    const v1Chapters: V1ChapterFragment[] = [
      {
        chapterNumber: 1,
        characters: [
          {
            slug: "julia",
            characterName: "Julia",
            bookSlug: "1984",
            infoPerChapter: [
              {
                chapter: 1,
                summary: "Mysterious girl",
                paragraphsWhereSpotted: [34],
                paragraphsWhereTalking: [],
              },
            ],
          },
        ],
      },
      {
        chapterNumber: 2,
        characters: [
          {
            slug: "julia",
            characterName: "Julia",
            bookSlug: "1984",
            infoPerChapter: [
              {
                chapter: 2,
                summary: "Winston's lover",
                paragraphsWhereSpotted: [10],
                paragraphsWhereTalking: [15],
              },
            ],
          },
        ],
      },
    ];

    const bundles: CharacterBundle[] = [
      { slug: "julia", name: "Julia", summary: "Winston's lover" },
    ];

    const { index } = v1ToV2(v1Chapters, bundles);

    expect(index.characters["julia"].summary).toBe("Winston's lover");
    expect(index.characters["julia"].overrides).toEqual([
      { from: [1, 34], to: [2, 9], summary: "Mysterious girl" },
    ]);
  });

  it("preserves media from bundles", () => {
    const v1Chapters: V1ChapterFragment[] = [
      {
        chapterNumber: 1,
        characters: [
          {
            slug: "winston",
            characterName: "Winston",
            bookSlug: "1984",
            infoPerChapter: [
              {
                chapter: 1,
                summary: "Clerk",
                paragraphsWhereSpotted: [0],
                paragraphsWhereTalking: [],
              },
            ],
          },
        ],
      },
    ];

    const bundles: CharacterBundle[] = [
      {
        slug: "winston",
        name: "Winston",
        summary: "Clerk",
        media: { avatarUrl: "avatar.png", speaksUrl: "speaks.mp4", listensUrl: "listens.mp4" },
      },
    ];

    const { index } = v1ToV2(v1Chapters, bundles);

    expect(index.characters["winston"].media).toEqual({
      avatarUrl: "avatar.png",
      speaksUrl: "speaks.mp4",
      listensUrl: "listens.mp4",
    });
  });
});

describe("resolveSummary", () => {
  it("returns default summary when no overrides", () => {
    const meta = { name: "Winston", summary: "A clerk" };

    expect(resolveSummary(meta, 1, 0)).toBe("A clerk");
  });

  it("returns override summary when in range", () => {
    const meta = {
      name: "Julia",
      summary: "Winston's lover",
      overrides: [{ from: [1, 0] as [number, number], summary: "Mysterious girl" }],
    };

    expect(resolveSummary(meta, 1, 10)).toBe("Mysterious girl");
    expect(resolveSummary(meta, 2, 0)).toBe("Mysterious girl");
  });

  it("returns default when before override range", () => {
    const meta = {
      name: "Julia",
      summary: "Winston's lover",
      overrides: [{ from: [2, 50] as [number, number], summary: "Mysterious girl" }],
    };

    expect(resolveSummary(meta, 1, 0)).toBe("Winston's lover");
    expect(resolveSummary(meta, 2, 40)).toBe("Winston's lover");
  });

  it("respects to range", () => {
    const meta = {
      name: "Julia",
      summary: "Winston's lover",
      overrides: [
        {
          from: [1, 0] as [number, number],
          to: [1, 50] as [number, number],
          summary: "Mysterious girl",
        },
      ],
    };

    expect(resolveSummary(meta, 1, 25)).toBe("Mysterious girl");
    expect(resolveSummary(meta, 1, 60)).toBe("Winston's lover");
    expect(resolveSummary(meta, 2, 0)).toBe("Winston's lover");
  });
});

describe("v2ToV1 round-trip", () => {
  it("round-trips basic prose data", () => {
    const v1Input: V1ChapterFragment[] = [
      {
        chapterNumber: 1,
        characters: [
          {
            slug: "winston",
            characterName: "Winston Smith",
            bookSlug: "1984",
            infoPerChapter: [
              {
                chapter: 1,
                summary: "A clerk",
                paragraphsWhereSpotted: [0, 5, 12],
                paragraphsWhereTalking: [3, 8],
              },
            ],
          },
          {
            slug: "julia",
            characterName: "Julia",
            bookSlug: "1984",
            infoPerChapter: [
              {
                chapter: 1,
                summary: "A girl",
                paragraphsWhereSpotted: [34],
                paragraphsWhereTalking: [],
              },
            ],
          },
        ],
      },
      {
        chapterNumber: 2,
        characters: [
          {
            slug: "winston",
            characterName: "Winston Smith",
            bookSlug: "1984",
            infoPerChapter: [
              {
                chapter: 2,
                summary: "A clerk",
                paragraphsWhereSpotted: [0, 10],
                paragraphsWhereTalking: [5],
              },
            ],
          },
        ],
      },
    ];

    const bundles: CharacterBundle[] = [
      { slug: "winston", name: "Winston Smith", summary: "A clerk" },
      { slug: "julia", name: "Julia", summary: "A girl" },
    ];

    const { index, chapters } = v1ToV2(v1Input, bundles);
    const v1Output = v2ToV1(index, chapters, "1984");

    expect(normalizeV1(v1Output)).toEqual(normalizeV1(v1Input));
  });

  it("round-trips play with enters/exits", () => {
    const v1Input: V1ChapterFragment[] = [
      {
        chapterNumber: 1,
        characters: [
          {
            slug: "hamlet",
            characterName: "Hamlet",
            bookSlug: "hamlet",
            infoPerChapter: [
              {
                chapter: 1,
                summary: "Prince of Denmark",
                paragraphsWhereSpotted: [10, 20],
                paragraphsWhereTalking: [15, 25],
                paragraphsWhereEnters: [10],
                paragraphsWhereExits: [30],
              },
            ],
          },
        ],
      },
    ];

    const bundles: CharacterBundle[] = [
      { slug: "hamlet", name: "Hamlet", summary: "Prince of Denmark" },
    ];

    const { index, chapters } = v1ToV2(v1Input, bundles);

    expect(index.form).toBe("play");

    const v1Output = v2ToV1(index, chapters, "hamlet");

    expect(normalizeV1(v1Output)).toEqual(normalizeV1(v1Input));
  });

  it("round-trips with summary overrides", () => {
    const v1Input: V1ChapterFragment[] = [
      {
        chapterNumber: 1,
        characters: [
          {
            slug: "julia",
            characterName: "Julia",
            bookSlug: "1984",
            infoPerChapter: [
              {
                chapter: 1,
                summary: "Mysterious girl",
                paragraphsWhereSpotted: [34],
                paragraphsWhereTalking: [],
              },
            ],
          },
        ],
      },
      {
        chapterNumber: 2,
        characters: [
          {
            slug: "julia",
            characterName: "Julia",
            bookSlug: "1984",
            infoPerChapter: [
              {
                chapter: 2,
                summary: "Winston's lover",
                paragraphsWhereSpotted: [10],
                paragraphsWhereTalking: [15],
              },
            ],
          },
        ],
      },
    ];

    const bundles: CharacterBundle[] = [
      { slug: "julia", name: "Julia", summary: "Winston's lover" },
    ];

    const { index, chapters } = v1ToV2(v1Input, bundles);
    const v1Output = v2ToV1(index, chapters, "1984");

    expect(normalizeV1(v1Output)).toEqual(normalizeV1(v1Input));
  });
});

describe("mergeV2ToCharacterData", () => {
  it("merges multiple chapters into single CharacterData array", () => {
    const index: CharacterIndex = {
      form: "prose",
      characters: {
        winston: { name: "Winston Smith", summary: "A clerk", media: { avatarUrl: "avatar.png" } },
        julia: { name: "Julia", summary: "A girl" },
      },
    };

    const chapters: Record<number, ChapterOccurrences> = {
      1: { winston: { s: [0, 5], t: [3] }, julia: { s: [34], t: [] } },
      2: { winston: { s: [0, 10], t: [5] } },
    };

    const result = mergeV2ToCharacterData(index, chapters, "1984");

    expect(result).toHaveLength(2);

    const winston = result.find((c) => c.slug === "winston");
    expect(winston?.characterName).toBe("Winston Smith");
    expect(winston?.infoPerChapter).toHaveLength(2);
    expect(winston?.infoPerChapter[0].chapter).toBe(1);
    expect(winston?.infoPerChapter[1].chapter).toBe(2);
    expect(winston?.media).toEqual({ avatarUrl: "avatar.png" });

    const julia = result.find((c) => c.slug === "julia");
    expect(julia?.infoPerChapter).toHaveLength(1);
    expect(julia?.infoPerChapter[0].chapter).toBe(1);
  });

  it("excludes characters with no occurrences", () => {
    const index: CharacterIndex = {
      form: "prose",
      characters: {
        winston: { name: "Winston Smith", summary: "A clerk" },
        goldstein: { name: "Goldstein", summary: "Enemy of the state" },
      },
    };

    const chapters: Record<number, ChapterOccurrences> = { 1: { winston: { s: [0], t: [] } } };

    const result = mergeV2ToCharacterData(index, chapters, "1984");

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("winston");
  });

  it("applies summary overrides correctly", () => {
    const index: CharacterIndex = {
      form: "prose",
      characters: {
        julia: {
          name: "Julia",
          summary: "Winston's lover",
          overrides: [{ from: [1, 0], to: [1, 50], summary: "Mysterious girl" }],
        },
      },
    };

    const chapters: Record<number, ChapterOccurrences> = {
      1: { julia: { s: [34], t: [] } },
      2: { julia: { s: [10], t: [15] } },
    };

    const result = mergeV2ToCharacterData(index, chapters, "1984");

    expect(result[0].infoPerChapter[0].summary).toBe("Mysterious girl");
    expect(result[0].infoPerChapter[1].summary).toBe("Winston's lover");
  });

  it("preserves role on merged character data", () => {
    const index: CharacterIndex = {
      form: "prose",
      characters: { winston: { name: "Winston Smith", summary: "A clerk", role: "State Clerk" } },
    };

    const chapters: Record<number, ChapterOccurrences> = { 1: { winston: { s: [1], t: [] } } };

    const result = mergeV2ToCharacterData(index, chapters, "1984");

    expect(result[0].role).toBe("State Clerk");
  });
});

describe("buildCharacterIndex", () => {
  it("builds index from bundles", () => {
    const bundles: CharacterBundle[] = [
      {
        slug: "winston",
        name: "Winston Smith",
        summary: "A clerk at the Ministry",
        role: "State Clerk",
        media: { avatarUrl: "avatar.png", speaksUrl: "speaks.mp4" },
      },
      { slug: "julia", name: "Julia", summary: "Winston's lover" },
    ];

    const index = buildCharacterIndex(bundles, "prose");

    expect(index.form).toBe("prose");
    expect(Object.keys(index.characters)).toHaveLength(2);
    expect(index.characters["winston"]).toEqual({
      name: "Winston Smith",
      summary: "A clerk at the Ministry",
      role: "State Clerk",
      media: { avatarUrl: "avatar.png", speaksUrl: "speaks.mp4" },
    });
    expect(index.characters["julia"]).toEqual({
      name: "Julia",
      summary: "Winston's lover",
      media: undefined,
    });
  });

  it("sets correct form for plays", () => {
    const bundles: CharacterBundle[] = [{ slug: "hamlet", name: "Hamlet", summary: "Prince" }];

    const index = buildCharacterIndex(bundles, "play");

    expect(index.form).toBe("play");
  });
});

describe("size comparison", () => {
  it("V2 format is significantly smaller than V1", () => {
    const generateV1 = (chapterCount: number, characterCount: number): V1ChapterFragment[] => {
      const chapters: V1ChapterFragment[] = [];
      for (let ch = 1; ch <= chapterCount; ch++) {
        chapters.push({
          chapterNumber: ch,
          characters: Array.from({ length: characterCount }, (_, i) => ({
            slug: `character-${i}`,
            characterName: `Character Number ${i}`,
            bookSlug: "test-book-with-long-slug",
            infoPerChapter: [
              {
                chapter: ch,
                summary: `This is a detailed summary for character ${i} that explains their role.`,
                paragraphsWhereSpotted: Array.from({ length: 5 }, (_, j) => j * 10 + ch),
                paragraphsWhereTalking: Array.from({ length: 3 }, (_, j) => j * 15 + ch),
              },
            ],
          })),
        });
      }
      return chapters;
    };

    const bundles: CharacterBundle[] = Array.from({ length: 20 }, (_, i) => ({
      slug: `character-${i}`,
      name: `Character Number ${i}`,
      summary: `This is a detailed summary for character ${i} that explains their role.`,
    }));

    const v1Data = generateV1(30, 20);
    const { index, chapters } = v1ToV2(v1Data, bundles);

    const v1TotalSize = v1Data.reduce((sum, ch) => sum + JSON.stringify(ch).length, 0);
    const v2IndexSize = JSON.stringify(index).length;
    const v2ChaptersSize = Object.values(chapters).reduce(
      (sum, ch) => sum + JSON.stringify(ch).length,
      0,
    );
    const v2TotalSize = v2IndexSize + v2ChaptersSize;

    console.log(`V1 total: ${(v1TotalSize / 1024).toFixed(1)}KB`);
    console.log(`V2 index: ${(v2IndexSize / 1024).toFixed(1)}KB`);
    console.log(`V2 chapters: ${(v2ChaptersSize / 1024).toFixed(1)}KB`);
    console.log(`V2 total: ${(v2TotalSize / 1024).toFixed(1)}KB`);
    console.log(`Reduction: ${((1 - v2TotalSize / v1TotalSize) * 100).toFixed(0)}%`);

    expect(v2TotalSize).toBeLessThan(v1TotalSize * 0.3);
  });
});
