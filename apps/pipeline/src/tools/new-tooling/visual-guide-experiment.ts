import { FILE_TYPE } from "../../helpers/filesHelpers";
import { generateTagName } from "../../helpers/generateTagName";
import { writeBookFile } from "../../helpers/writeBookFile";
import { type NewReferenceCardsResponse } from "../../types";

export type VisualGuidePromptOutput = { characters: Array<{ name: string; visualGuide: string }> };

export type VisualGuideShadowOutput = { characters: Array<{ name: string; visualGuide?: string }> };

const VISUAL_GUIDE_SHORT_THRESHOLD = 40;

export function buildVisualGuideExperimentRunId(): string {
  const fromEnv = process.env.VISUAL_GUIDE_EXPERIMENT_RUN_ID;
  if (fromEnv) {
    return fromEnv;
  }

  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `${iso}-${random}`;
}

export function normalizeCharacterName(name: string): string {
  return generateTagName(name.trim());
}

function buildCharacterGuideMap(
  characters: Array<{ name: string; visualGuide?: string }>,
): Map<string, string | undefined> {
  const map = new Map<string, string | undefined>();
  for (const character of characters) {
    const normalized = normalizeCharacterName(character.name);
    if (!map.has(normalized)) {
      map.set(normalized, character.visualGuide);
    }
  }
  return map;
}

function getGuideLengthStats(
  requestedCharacterNames: string[],
  guideMap: Map<string, string | undefined>,
): { avg: number; min: number; max: number } {
  const lengths = requestedCharacterNames
    .map((name) => (guideMap.get(name) || "").trim().length)
    .filter((length) => length > 0);

  if (lengths.length === 0) {
    return { avg: 0, min: 0, max: 0 };
  }

  const total = lengths.reduce((acc, length) => acc + length, 0);
  return {
    avg: Number((total / lengths.length).toFixed(2)),
    min: Math.min(...lengths),
    max: Math.max(...lengths),
  };
}

export function buildRequestedCharacterNames(
  referenceCards: NewReferenceCardsResponse,
  knownCharactersArray: string[],
): string[] {
  return Array.from(
    new Set(
      referenceCards.characters
        .filter(({ name }) => !knownCharactersArray.includes(name))
        .map((character) => normalizeCharacterName(character.name))
        .filter((name) => name !== "generic-avatar"),
    ),
  );
}

export function buildShadowCandidateFromReferenceCards(
  referenceCards: NewReferenceCardsResponse,
  requestedCharacterNames: string[],
): VisualGuideShadowOutput {
  const requestedSet = new Set(requestedCharacterNames);
  const seen = new Set<string>();
  const characters: VisualGuideShadowOutput["characters"] = [];

  for (const character of referenceCards.characters) {
    const normalizedName = normalizeCharacterName(character.name);
    if (!requestedSet.has(normalizedName) || seen.has(normalizedName)) {
      continue;
    }

    seen.add(normalizedName);
    characters.push({ name: normalizedName, visualGuide: character.visualGuide });
  }

  return { characters };
}

export function buildVisualGuideScorecard(
  requestedCharacterNames: string[],
  aOutput: VisualGuidePromptOutput,
  cOutput: VisualGuideShadowOutput,
) {
  const requestedSet = new Set(requestedCharacterNames);
  const aMap = buildCharacterGuideMap(aOutput.characters);
  const cMap = buildCharacterGuideMap(cOutput.characters);

  const aReturned = requestedCharacterNames.filter((name) => aMap.has(name));
  const cReturned = requestedCharacterNames.filter((name) => cMap.has(name));
  const overlapReturned = aReturned.filter((name) => cReturned.includes(name));

  const aMissing = requestedCharacterNames.filter((name) => !aReturned.includes(name));
  const cMissing = requestedCharacterNames.filter((name) => !cReturned.includes(name));

  const aEmptyCount = requestedCharacterNames.filter(
    (name) => (aMap.get(name) || "").trim().length === 0,
  ).length;
  const cEmptyCount = requestedCharacterNames.filter(
    (name) => (cMap.get(name) || "").trim().length === 0,
  ).length;

  const aTooShortCount = requestedCharacterNames.filter((name) => {
    const length = (aMap.get(name) || "").trim().length;
    return length > 0 && length < VISUAL_GUIDE_SHORT_THRESHOLD;
  }).length;
  const cTooShortCount = requestedCharacterNames.filter((name) => {
    const length = (cMap.get(name) || "").trim().length;
    return length > 0 && length < VISUAL_GUIDE_SHORT_THRESHOLD;
  }).length;

  const denominator = requestedCharacterNames.length || 1;
  const aLengthStats = getGuideLengthStats(requestedCharacterNames, aMap);
  const cLengthStats = getGuideLengthStats(requestedCharacterNames, cMap);

  return {
    requestedCharactersCount: requestedCharacterNames.length,
    aReturnedCount: aReturned.length,
    cReturnedCount: cReturned.length,
    aMissingCount: aMissing.length,
    cMissingCount: cMissing.length,
    missingDelta: cMissing.length - aMissing.length,
    overlap: {
      returnedIntersectionCount: overlapReturned.length,
      requestedIntersectionCount: requestedSet.size,
    },
    missingCharacters: { a: aMissing, c: cMissing },
    visualGuideLength: { a: aLengthStats, c: cLengthStats },
    qualityHeuristics: {
      shortThreshold: VISUAL_GUIDE_SHORT_THRESHOLD,
      aEmptyPercent: Number(((aEmptyCount / denominator) * 100).toFixed(2)),
      cEmptyPercent: Number(((cEmptyCount / denominator) * 100).toFixed(2)),
      aTooShortPercent: Number(((aTooShortCount / denominator) * 100).toFixed(2)),
      cTooShortPercent: Number(((cTooShortCount / denominator) * 100).toFixed(2)),
    },
  };
}

export function writeVisualGuideExperimentArtifacts(
  runId: string,
  requestedCharacterNames: string[],
  aOutput: VisualGuidePromptOutput,
  cOutput: VisualGuideShadowOutput,
): void {
  const root = `visual-guide-experiments/${runId}`;
  const nameMapping = {
    requested: requestedCharacterNames,
    a: aOutput.characters.map((character) => ({
      originalName: character.name,
      normalizedName: normalizeCharacterName(character.name),
    })),
    c: cOutput.characters.map((character) => ({
      originalName: character.name,
      normalizedName: normalizeCharacterName(character.name),
    })),
  };
  const scorecard = buildVisualGuideScorecard(requestedCharacterNames, aOutput, cOutput);

  writeBookFile(`${root}/a-output.json`, JSON.stringify(aOutput, null, 2), FILE_TYPE.TEMPORARY);
  writeBookFile(`${root}/c-output.json`, JSON.stringify(cOutput, null, 2), FILE_TYPE.TEMPORARY);
  writeBookFile(
    `${root}/name-mapping.json`,
    JSON.stringify(nameMapping, null, 2),
    FILE_TYPE.TEMPORARY,
  );
  writeBookFile(`${root}/scorecard.json`, JSON.stringify(scorecard, null, 2), FILE_TYPE.TEMPORARY);
}
