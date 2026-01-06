import {
  type CharacterData,
  type CharacterOverride,
  type ChapterParagraphRef,
} from "@player/types/book";
import { getBookAssetUrl } from "@player/utils/assetUrls";

const LOCATION_REGEX = /^ch(\d+)-p(\d+)$/i;

const hasFileExtension = (value: string) => /\.[a-z0-9]+$/i.test(value);

export const compareLocations = (a: ChapterParagraphRef, b: ChapterParagraphRef): number => {
  if (a.chapter !== b.chapter) {
    return a.chapter - b.chapter;
  }
  return a.paragraph - b.paragraph;
};

const isOnOrAfter = (location: ChapterParagraphRef, start: ChapterParagraphRef) =>
  compareLocations(location, start) >= 0;
const isOnOrBefore = (location: ChapterParagraphRef, end: ChapterParagraphRef) =>
  compareLocations(location, end) <= 0;

export const parseChapterParagraphId = (id?: string | null): ChapterParagraphRef | null => {
  if (!id) return null;
  const match = id.trim().match(LOCATION_REGEX);
  if (!match) return null;

  const chapter = Number.parseInt(match[1], 10);
  const paragraph = Number.parseInt(match[2], 10);

  if (Number.isNaN(chapter) || Number.isNaN(paragraph)) return null;

  return { chapter, paragraph };
};

export const findActiveOverride = (
  character: CharacterData,
  location?: ChapterParagraphRef | null,
): CharacterOverride | null => {
  if (!location || !character.overrides?.length) {
    return null;
  }

  let active: CharacterOverride | null = null;

  for (const override of character.overrides) {
    if (!override?.from) continue;

    if (!isOnOrAfter(location, override.from)) {
      continue;
    }

    if (override.to && !isOnOrBefore(location, override.to)) {
      continue;
    }

    if (!active || compareLocations(override.from, active.from) >= 0) {
      active = override;
    }
  }

  return active;
};

export interface CharacterSnapshotOptions {
  location?: ChapterParagraphRef | null;
  baseSummary?: string;
  fallbackDisplayName?: string;
}

export interface CharacterSnapshot {
  displayName: string;
  summary?: string;
  override: CharacterOverride | null;
  media: {
    listening: string;
    talking: string;
    usesExplicitAsset: boolean;
    baseNameUsed: string;
    explicitAssetUrl?: string;
  };
}

export const resolveCharacterSnapshot = (
  character: CharacterData,
  { location = null, baseSummary, fallbackDisplayName }: CharacterSnapshotOptions = {},
  // eslint-disable-next-line complexity -- character snapshot resolution with override cascading
): CharacterSnapshot => {
  const override = findActiveOverride(character, location);

  const displayName = override?.display ?? fallbackDisplayName ?? character.characterName;
  const normalizedBaseSummary =
    baseSummary && baseSummary.trim().length > 0 ? baseSummary : undefined;
  const derivedBaseSummary = normalizedBaseSummary ?? character.infoPerChapter[0]?.summary;
  const summary = override?.summary ?? derivedBaseSummary;

  const avatarValue = override?.avatar?.trim();
  const usesExplicitAsset = Boolean(avatarValue && hasFileExtension(avatarValue));

  let listening: string;
  let talking: string;
  let baseNameUsed: string;
  let explicitAssetUrl: string | undefined;

  if (usesExplicitAsset && avatarValue) {
    // Override with explicit asset file
    explicitAssetUrl = getBookAssetUrl(avatarValue);
    listening = explicitAssetUrl;
    talking = explicitAssetUrl;
    baseNameUsed = avatarValue;
  } else {
    // Use Convex URLs directly
    listening = character.media?.listensUrl ?? character.media?.avatarUrl ?? "";
    talking =
      character.media?.speaksUrl ?? character.media?.listensUrl ?? character.media?.avatarUrl ?? "";
    baseNameUsed = character.slug;
  }

  return {
    displayName,
    summary,
    override,
    media: {
      listening,
      talking,
      usesExplicitAsset: usesExplicitAsset && Boolean(explicitAssetUrl),
      baseNameUsed,
      explicitAssetUrl,
    },
  };
};
