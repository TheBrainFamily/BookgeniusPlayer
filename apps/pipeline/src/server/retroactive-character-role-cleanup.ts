import { parseArgs } from "util";
import { getCharacterFolders, type CharacterFolder, updateCharacterFolder } from "./convex-client";
import {
  generateRolesAndRemoveSpoilersFromSummaries,
  type CharacterRoleCleanupInputCharacter,
} from "../tools/new-tooling/generate-roles-and-remove-spoilers-from-summaries";
import { FILE_TYPE } from "../helpers/filesHelpers";
import { setCurrentBook } from "../helpers/getCurrentBook";
import { writeBookFile } from "../helpers/writeBookFile";
import {
  buildCleanedCharacterSummaryMap,
  resolveCharacterMetadataForUpload,
} from "./character-metadata-cleanup";

type UpdateResult = {
  slug: string;
  displayName: string;
  status: "updated" | "error";
  previousSummary: string;
  nextSummary: string;
  previousRole: string | null;
  nextRole: string | null;
  error?: string;
};

type RunSummary = {
  slug: string;
  bookPath: string;
  runId: string;
  totalCharacters: number;
  successfulUpdates: number;
  failedUpdates: number;
  runDir: string;
};

export type RetroactiveCharacterRoleCleanupResult = {
  summary: RunSummary;
  results: UpdateResult[];
};

type RetroactiveCleanupDeps = {
  getCharacterFoldersFn?: typeof getCharacterFolders;
  updateCharacterFolderFn?: typeof updateCharacterFolder;
  generateCleanupFn?: typeof generateRolesAndRemoveSpoilersFromSummaries;
  writeBookFileFn?: typeof writeBookFile;
  setCurrentBookFn?: typeof setCurrentBook;
};

function buildRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseCliSlug(argv: string[]): string | null {
  const parsed = parseArgs({
    args: argv,
    options: { slug: { type: "string" } },
    allowPositionals: true,
  });
  return parsed.values.slug || parsed.positionals[0] || null;
}

function toCleanupInput(characters: CharacterFolder[]): CharacterRoleCleanupInputCharacter[] {
  return characters.map((character) => ({
    slug: character.slug,
    name: character.displayName,
    referenceCard: character.summary,
  }));
}

export async function runRetroactiveCharacterRoleCleanup(params: {
  slug: string;
  runId?: string;
  deps?: RetroactiveCleanupDeps;
}): Promise<RetroactiveCharacterRoleCleanupResult> {
  const { slug } = params;
  const runId = params.runId || buildRunId();
  const getCharacterFoldersFn = params.deps?.getCharacterFoldersFn ?? getCharacterFolders;
  const updateCharacterFolderFn = params.deps?.updateCharacterFolderFn ?? updateCharacterFolder;
  const generateCleanupFn =
    params.deps?.generateCleanupFn ?? generateRolesAndRemoveSpoilersFromSummaries;
  const writeBookFileFn = params.deps?.writeBookFileFn ?? writeBookFile;
  const setCurrentBookFn = params.deps?.setCurrentBookFn ?? setCurrentBook;
  const bookPath = `books/${slug}`;
  const selectedBookPath = `books-data/${slug}`;
  const runBase = `character-role-cleanup-runs/${runId}`;
  setCurrentBookFn(selectedBookPath);

  const existingCharacters = await getCharacterFoldersFn(bookPath);
  if (existingCharacters.length === 0) {
    throw new Error(`No characters found for ${bookPath}`);
  }

  writeBookFileFn(
    `${runBase}/pre-update-character-metadata.json`,
    JSON.stringify(existingCharacters, null, 2),
    FILE_TYPE.TEMPORARY,
  );

  const cleanupInput = toCleanupInput(existingCharacters);
  writeBookFileFn(
    `${runBase}/cleanup-input.json`,
    JSON.stringify(cleanupInput, null, 2),
    FILE_TYPE.TEMPORARY,
  );

  const cleaned = await generateCleanupFn({ inputCharacters: cleanupInput });
  writeBookFileFn(
    `${runBase}/cleanup-output.json`,
    JSON.stringify(cleaned, null, 2),
    FILE_TYPE.TEMPORARY,
  );

  const cleanedBySlug = buildCleanedCharacterSummaryMap(cleaned);
  const results: UpdateResult[] = [];

  for (const character of existingCharacters) {
    const resolved = resolveCharacterMetadataForUpload(
      { slug: character.slug, referenceCard: character.summary },
      cleanedBySlug,
    );
    const nextRole = resolved.role ?? null;

    try {
      await updateCharacterFolderFn({
        bookPath,
        characterSlug: character.slug,
        displayName: character.displayName,
        summary: resolved.summary,
        role: resolved.role,
        aiPrompt: character.aiPrompt,
      });

      results.push({
        slug: character.slug,
        displayName: character.displayName,
        status: "updated",
        previousSummary: character.summary,
        nextSummary: resolved.summary,
        previousRole: character.role ?? null,
        nextRole,
      });
    } catch (error) {
      results.push({
        slug: character.slug,
        displayName: character.displayName,
        status: "error",
        previousSummary: character.summary,
        nextSummary: resolved.summary,
        previousRole: character.role ?? null,
        nextRole,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  writeBookFileFn(
    `${runBase}/update-results.json`,
    JSON.stringify(results, null, 2),
    FILE_TYPE.TEMPORARY,
  );

  const failedUpdates = results.filter((result) => result.status === "error").length;
  const successfulUpdates = results.length - failedUpdates;
  const runDir = `books-data/${slug}/temporary-output/${runBase}`;
  const summary: RunSummary = {
    slug,
    bookPath,
    runId,
    totalCharacters: results.length,
    successfulUpdates,
    failedUpdates,
    runDir,
  };
  writeBookFileFn(`${runBase}/summary.json`, JSON.stringify(summary, null, 2), FILE_TYPE.TEMPORARY);

  return { summary, results };
}

if (require.main === module) {
  const slug = parseCliSlug(process.argv.slice(2));
  if (!slug) {
    console.error(
      "Usage: bun run apps/pipeline/src/server/retroactive-character-role-cleanup.ts --slug <book-slug>",
    );
    process.exit(1);
  }

  runRetroactiveCharacterRoleCleanup({ slug })
    .then((result) => {
      console.log(
        `Processed ${result.summary.totalCharacters} characters (${result.summary.successfulUpdates} updated, ${result.summary.failedUpdates} failed)`,
      );
      console.log(`Artifacts: ${result.summary.runDir}`);
      if (result.summary.failedUpdates > 0) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
