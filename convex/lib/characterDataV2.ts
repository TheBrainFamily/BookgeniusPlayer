export type CharacterOccurrences = {
  s: number[]; // spotted
  t: number[]; // talking
  e?: number[]; // enters (plays)
  x?: number[]; // exits (plays)
};

export type ChapterOccurrences = Record<string, CharacterOccurrences>;

export type CharacterMeta = {
  name: string;
  summary: string;
  media?: { avatarUrl?: string; speaksUrl?: string; listensUrl?: string };
  overrides?: {
    from: [chapter: number, paragraph: number];
    to?: [chapter: number, paragraph: number];
    summary?: string;
    display?: string;
    avatar?: string;
  }[];
};

export type CharacterIndex = {
  form: "prose" | "play" | "mixed";
  characters: Record<string, CharacterMeta>;
};

export type CompiledChapter = {
  html: string;
  occurrences: ChapterOccurrences;
  title?: string;
  paragraphCount: number;
};

export type V1InfoPerChapter = {
  chapter: number;
  summary: string;
  paragraphsWhereSpotted: number[];
  paragraphsWhereTalking: number[];
  paragraphsWhereEnters?: number[];
  paragraphsWhereExits?: number[];
};

export type V1CharacterData = {
  slug: string;
  characterName: string;
  bookSlug: string;
  infoPerChapter: V1InfoPerChapter[];
  overrides?: {
    from: { chapter: number; paragraph: number };
    to?: { chapter: number; paragraph: number };
    summary?: string;
    display?: string;
    avatar?: string;
  }[];
  media?: { avatarUrl?: string; listensUrl?: string; speaksUrl?: string };
};

export type V1ChapterFragment = {
  chapterNumber: number;
  characters: {
    slug: string;
    characterName: string;
    bookSlug: string;
    infoPerChapter: V1InfoPerChapter[];
  }[];
};

export type CharacterBundle = {
  slug: string;
  name: string;
  summary: string;
  media?: { avatarUrl?: string; speaksUrl?: string; listensUrl?: string };
};

export function extractOccurrences(
  characters: { slug: string; infoPerChapter: V1InfoPerChapter[] }[],
  chapterNumber: number,
): ChapterOccurrences {
  const occurrences: ChapterOccurrences = {};

  for (const char of characters) {
    const info = char.infoPerChapter.find((i) => i.chapter === chapterNumber);
    if (!info) continue;

    const hasData =
      info.paragraphsWhereSpotted.length > 0 ||
      info.paragraphsWhereTalking.length > 0 ||
      (info.paragraphsWhereEnters?.length ?? 0) > 0 ||
      (info.paragraphsWhereExits?.length ?? 0) > 0;

    if (hasData) {
      const occ: CharacterOccurrences = {
        s: info.paragraphsWhereSpotted,
        t: info.paragraphsWhereTalking,
      };
      if (info.paragraphsWhereEnters?.length) occ.e = info.paragraphsWhereEnters;
      if (info.paragraphsWhereExits?.length) occ.x = info.paragraphsWhereExits;
      occurrences[char.slug] = occ;
    }
  }

  return occurrences;
}

export type V2TransformResult = {
  index: CharacterIndex;
  chapters: Record<number, ChapterOccurrences>;
};

type ChapterSummaryInfo = { chapter: number; paragraph: number; summary: string };

function buildOverridesFromSummarySequence(
  summarySequence: ChapterSummaryInfo[],
  defaultSummary: string,
): CharacterMeta["overrides"] {
  if (summarySequence.length === 0) return undefined;

  const sorted = [...summarySequence].sort(
    (a, b) => a.chapter - b.chapter || a.paragraph - b.paragraph,
  );

  const overrides: NonNullable<CharacterMeta["overrides"]> = [];
  let currentOverride: { from: [number, number]; summary: string } | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const { chapter, paragraph, summary } = sorted[i];
    const isDefault = summary === defaultSummary;

    if (currentOverride) {
      if (summary !== currentOverride.summary) {
        overrides.push({
          from: currentOverride.from,
          to: [chapter, paragraph > 0 ? paragraph - 1 : 0],
          summary: currentOverride.summary,
        });
        currentOverride = isDefault ? null : { from: [chapter, paragraph], summary };
      }
    } else if (!isDefault) {
      currentOverride = { from: [chapter, paragraph], summary };
    }
  }

  if (currentOverride) {
    overrides.push({ from: currentOverride.from, summary: currentOverride.summary });
  }

  return overrides.length > 0 ? overrides : undefined;
}

export function v1ToV2(
  v1Chapters: V1ChapterFragment[],
  bundles: CharacterBundle[],
): V2TransformResult {
  const hasEntersExits = v1Chapters.some((ch) =>
    ch.characters.some((c) =>
      c.infoPerChapter.some(
        (i) =>
          (i.paragraphsWhereEnters?.length ?? 0) > 0 || (i.paragraphsWhereExits?.length ?? 0) > 0,
      ),
    ),
  );

  const characters: Record<string, CharacterMeta> = {};
  for (const bundle of bundles) {
    characters[bundle.slug] = { name: bundle.name, summary: bundle.summary, media: bundle.media };
  }

  const summarySequences = new Map<string, ChapterSummaryInfo[]>();

  for (const chapter of v1Chapters) {
    for (const char of chapter.characters) {
      const meta = characters[char.slug];
      if (!meta) continue;

      for (const info of char.infoPerChapter) {
        if (!info.summary) continue;

        const firstParagraph = Math.min(
          ...(info.paragraphsWhereSpotted.length ? info.paragraphsWhereSpotted : [Infinity]),
          ...(info.paragraphsWhereTalking.length ? info.paragraphsWhereTalking : [Infinity]),
        );

        if (!summarySequences.has(char.slug)) {
          summarySequences.set(char.slug, []);
        }
        summarySequences
          .get(char.slug)!
          .push({
            chapter: info.chapter,
            paragraph: firstParagraph === Infinity ? 0 : firstParagraph,
            summary: info.summary,
          });
      }
    }
  }

  for (const [slug, sequence] of summarySequences) {
    const meta = characters[slug];
    if (!meta) continue;
    meta.overrides = buildOverridesFromSummarySequence(sequence, meta.summary);
  }

  const chapters: Record<number, ChapterOccurrences> = {};
  for (const v1Ch of v1Chapters) {
    const occurrences = extractOccurrences(
      v1Ch.characters.map((c) => ({ slug: c.slug, infoPerChapter: c.infoPerChapter })),
      v1Ch.chapterNumber,
    );

    if (Object.keys(occurrences).length > 0) {
      chapters[v1Ch.chapterNumber] = occurrences;
    }
  }

  return { index: { form: hasEntersExits ? "play" : "prose", characters }, chapters };
}

export function resolveSummary(meta: CharacterMeta, chapter: number, paragraph: number): string {
  if (!meta.overrides?.length) return meta.summary;

  let activeSummary = meta.summary;
  for (const override of meta.overrides) {
    const [fromCh, fromP] = override.from;
    if (chapter < fromCh || (chapter === fromCh && paragraph < fromP)) continue;
    if (override.to) {
      const [toCh, toP] = override.to;
      if (chapter > toCh || (chapter === toCh && paragraph > toP)) continue;
    }
    if (override.summary) {
      activeSummary = override.summary;
    }
  }

  return activeSummary;
}

export function v2ToV1(
  index: CharacterIndex,
  chapters: Record<number, ChapterOccurrences>,
  bookSlug: string,
): V1ChapterFragment[] {
  return Object.entries(chapters)
    .map(([chapterStr, occurrences]) => {
      const chapterNum = parseInt(chapterStr, 10);

      return {
        chapterNumber: chapterNum,
        characters: Object.entries(occurrences).map(([slug, occ]) => {
          const meta = index.characters[slug];
          const firstParagraph = Math.min(
            ...(occ.s.length ? occ.s : [Infinity]),
            ...(occ.t.length ? occ.t : [Infinity]),
            ...(occ.e?.length ? occ.e : [Infinity]),
          );

          return {
            slug,
            characterName: meta?.name ?? slug,
            bookSlug,
            infoPerChapter: [
              {
                chapter: chapterNum,
                summary: meta
                  ? resolveSummary(
                      meta,
                      chapterNum,
                      firstParagraph === Infinity ? 0 : firstParagraph,
                    )
                  : "",
                paragraphsWhereSpotted: occ.s,
                paragraphsWhereTalking: occ.t,
                ...(occ.e?.length ? { paragraphsWhereEnters: occ.e } : {}),
                ...(occ.x?.length ? { paragraphsWhereExits: occ.x } : {}),
              },
            ],
          };
        }),
      };
    })
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
}

export function buildCharacterIndex(
  bundles: CharacterBundle[],
  form: "prose" | "play" | "mixed",
): CharacterIndex {
  const characters: Record<string, CharacterMeta> = {};

  for (const bundle of bundles) {
    characters[bundle.slug] = { name: bundle.name, summary: bundle.summary, media: bundle.media };
  }

  return { form, characters };
}

export function mergeV2ToCharacterData(
  index: CharacterIndex,
  chapters: Record<number, ChapterOccurrences>,
  bookSlug: string,
): V1CharacterData[] {
  const result: V1CharacterData[] = [];

  for (const [slug, meta] of Object.entries(index.characters)) {
    const infoPerChapter: V1InfoPerChapter[] = [];

    for (const [chapterStr, occurrences] of Object.entries(chapters)) {
      const chapterNum = parseInt(chapterStr, 10);
      const occ = occurrences[slug];
      if (!occ) continue;

      const firstParagraph = Math.min(
        ...(occ.s.length ? occ.s : [Infinity]),
        ...(occ.t.length ? occ.t : [Infinity]),
        ...(occ.e?.length ? occ.e : [Infinity]),
      );

      infoPerChapter.push({
        chapter: chapterNum,
        summary: resolveSummary(meta, chapterNum, firstParagraph === Infinity ? 0 : firstParagraph),
        paragraphsWhereSpotted: occ.s,
        paragraphsWhereTalking: occ.t,
        ...(occ.e?.length ? { paragraphsWhereEnters: occ.e } : {}),
        ...(occ.x?.length ? { paragraphsWhereExits: occ.x } : {}),
      });
    }

    infoPerChapter.sort((a, b) => a.chapter - b.chapter);

    if (infoPerChapter.length > 0) {
      result.push({
        slug,
        characterName: meta.name,
        bookSlug,
        infoPerChapter,
        media: meta.media,
        overrides: meta.overrides?.map((o) => ({
          from: { chapter: o.from[0], paragraph: o.from[1] },
          to: o.to ? { chapter: o.to[0], paragraph: o.to[1] } : undefined,
          summary: o.summary,
          display: o.display,
          avatar: o.avatar,
        })),
      });
    }
  }

  return result;
}
