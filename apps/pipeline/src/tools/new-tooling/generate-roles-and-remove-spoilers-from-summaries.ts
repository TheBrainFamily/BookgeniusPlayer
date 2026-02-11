import fs from "fs";
import path from "path";
import { z } from "zod";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";
import { callGpt5WithSchema } from "../../callGpt5";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { generateTagName } from "../../helpers/generateTagName";
import { readBookFile } from "../../helpers/readBookFile";
import { writeBookFile } from "../../helpers/writeBookFile";
import { type NewReferenceCardsResponse } from "../../types";
import { NewReferenceCardsResponseSchema } from "../../schemes";

const INPUT_FILE_NAME = "single-summary-per-person.json";
const OUTPUT_FILE_NAME = "single-summary-per-person-roles.json";
const MODEL = "gemini-3-flash-preview";
const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;
const MAX_ATTEMPTS_PER_PROVIDER = 4;

const CharacterRoleCleanupInputCharacterSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  referenceCard: z.string(),
});

const CharacterRoleCleanupCharacterSchema = z.object({
  slug: z.string().min(1),
  referenceCard: z.string(),
  role: z.string().nullable(),
});

export const CharacterRoleCleanupResponseSchema = z.object({
  characters: z.array(CharacterRoleCleanupCharacterSchema),
});

export type CharacterRoleCleanupResponse = z.infer<typeof CharacterRoleCleanupResponseSchema>;
export type CharacterRoleCleanupInputCharacter = z.infer<
  typeof CharacterRoleCleanupInputCharacterSchema
>;

type GenerateRolesAndRemoveSpoilersOptions = {
  inputCharacters?: CharacterRoleCleanupInputCharacter[];
};

function isRetryableProviderError(error: unknown): boolean {
  const candidate = error as {
    status?: number;
    statusCode?: number;
    message?: string;
    responseBody?: string;
  };
  const status = candidate?.statusCode ?? candidate?.status;
  const message = `${candidate?.message || ""} ${candidate?.responseBody || ""}`.toLowerCase();

  return (
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted") ||
    message.includes("quota exceeded") ||
    message.includes("too many requests") ||
    message.includes("gateway") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("service unavailable") ||
    message.includes("fetch failed")
  );
}

function getRetryDelayMs(attempt: number): number {
  if (attempt <= 0) return 0;
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readInputCharacters(): CharacterRoleCleanupInputCharacter[] {
  const parsed = JSON.parse(readBookFile(INPUT_FILE_NAME, FILE_TYPE.PERMANENT)) as unknown;
  const validated = NewReferenceCardsResponseSchema.parse(parsed) as NewReferenceCardsResponse;
  return validated.characters.map((character) => ({
    slug: generateTagName(character.name).toLowerCase(),
    name: character.name,
    referenceCard: character.referenceCard,
  }));
}

function buildPrompt(characters: CharacterRoleCleanupInputCharacter[]): string {
  const template = fs.readFileSync(
    path.join(__dirname, "generate-roles-and-remove-spoilers-from-summaries.md"),
    "utf8",
  );
  const payload = JSON.stringify({ characters }, null, 2);

  return `${template}\n\`\`\`json\n${payload}\n\`\`\`\n`;
}

function isCoverageMismatchError(error: unknown): error is Error {
  return (
    error instanceof Error && error.message.includes("Spoiler cleanup response coverage mismatch")
  );
}

function toFileSafeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildCoverageCorrectionPrompt(
  basePrompt: string,
  inputCharacters: CharacterRoleCleanupInputCharacter[],
  invalidResponse: CharacterRoleCleanupResponse,
  validationErrorMessage: string,
): string {
  const expectedSlugs = inputCharacters.map((character) => character.slug);
  const retryContext = JSON.stringify(
    { validationError: validationErrorMessage, expectedSlugs, invalidResponse },
    null,
    2,
  );

  return `${basePrompt}

### RETRY FEEDBACK (IMPORTANT)

Your previous output failed validation and MUST be corrected.

Hard constraints:
- Keep the same character set by slug.
- Copy every slug EXACTLY from the input (no spelling/plural/grammar fixes).
- Return exactly ${expectedSlugs.length} characters, no extras, no omissions.
- Keep JSON shape exactly: { "characters": [{ "slug": "...", "referenceCard": "...", "role": "..." | null }] }

Previous validation failure context:
\`\`\`json
${retryContext}
\`\`\`

Return corrected JSON only.
`;
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function ensureCoverageAndOrder(
  inputCharacters: CharacterRoleCleanupInputCharacter[],
  response: CharacterRoleCleanupResponse,
): CharacterRoleCleanupResponse {
  const inputSlugs = inputCharacters.map((character) => normalizeSlug(character.slug));
  const inputSlugSet = new Set(inputSlugs);

  if (inputSlugs.length !== inputSlugSet.size) {
    throw new Error("Input character list contains duplicate slugs");
  }

  const responseBySlug = new Map<string, { referenceCard: string; role: string | null }>();
  for (const character of response.characters) {
    const normalized = normalizeSlug(character.slug);
    if (!normalized) {
      throw new Error("Spoiler cleanup response contains an empty slug");
    }
    if (responseBySlug.has(normalized)) {
      throw new Error(`Spoiler cleanup response contains duplicate slug: ${normalized}`);
    }
    responseBySlug.set(normalized, {
      referenceCard: character.referenceCard.trim(),
      role: character.role?.trim() || null,
    });
  }

  const missingSlugs: string[] = [];
  const extraSlugs: string[] = [];

  for (const inputSlug of inputSlugs) {
    if (!responseBySlug.has(inputSlug)) {
      missingSlugs.push(inputSlug);
    }
  }

  for (const responseSlug of responseBySlug.keys()) {
    if (!inputSlugSet.has(responseSlug)) {
      extraSlugs.push(responseSlug);
    }
  }

  if (missingSlugs.length > 0 || extraSlugs.length > 0) {
    const messages: string[] = [];
    if (missingSlugs.length > 0) {
      messages.push(`missing slugs: ${missingSlugs.join(", ")}`);
    }
    if (extraSlugs.length > 0) {
      messages.push(`unexpected slugs: ${extraSlugs.join(", ")}`);
    }
    throw new Error(`Spoiler cleanup response coverage mismatch (${messages.join(" | ")})`);
  }

  const orderedCharacters = inputCharacters.map((character) => {
    const normalized = normalizeSlug(character.slug);
    const fromResponse = responseBySlug.get(normalized);
    if (!fromResponse) {
      throw new Error(`Missing normalized response slug: ${normalized}`);
    }

    return {
      slug: character.slug,
      referenceCard: fromResponse.referenceCard,
      role: fromResponse.role,
    };
  });

  return { characters: orderedCharacters };
}

async function runProviderWithRetries(
  providerName: string,
  call: () => Promise<CharacterRoleCleanupResponse>,
): Promise<CharacterRoleCleanupResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
    if (attempt > 0) {
      await sleep(getRetryDelayMs(attempt));
    }

    try {
      return await call();
    } catch (error) {
      lastError = error;
      if (!isRetryableProviderError(error) || attempt === MAX_ATTEMPTS_PER_PROVIDER - 1) {
        break;
      }
    }
  }

  throw new Error(
    `${providerName} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function runProviderWithCoverageCorrection(params: {
  providerName: string;
  basePrompt: string;
  inputCharacters: CharacterRoleCleanupInputCharacter[];
  callWithPrompt: (prompt: string) => Promise<CharacterRoleCleanupResponse>;
}): Promise<CharacterRoleCleanupResponse> {
  const { providerName, basePrompt, inputCharacters, callWithPrompt } = params;
  const firstResult = await runProviderWithRetries(providerName, () => callWithPrompt(basePrompt));

  try {
    return ensureCoverageAndOrder(inputCharacters, firstResult);
  } catch (error) {
    if (!isCoverageMismatchError(error)) {
      throw error;
    }

    const correctionPrompt = buildCoverageCorrectionPrompt(
      basePrompt,
      inputCharacters,
      firstResult,
      error.message,
    );
    const providerToken = toFileSafeToken(providerName) || "provider";
    writeBookFile(
      `generate-roles-and-remove-spoilers-from-summaries-correction-prompt-${providerToken}.md`,
      correctionPrompt,
      FILE_TYPE.TEMPORARY,
    );

    const correctedResult = await runProviderWithRetries(`${providerName} corrective retry`, () =>
      callWithPrompt(correctionPrompt),
    );
    return ensureCoverageAndOrder(inputCharacters, correctedResult);
  }
}

export const generateRolesAndRemoveSpoilersFromSummaries = async (
  options: GenerateRolesAndRemoveSpoilersOptions = {},
): Promise<CharacterRoleCleanupResponse> => {
  const inputCharacters =
    options.inputCharacters?.map((character) =>
      CharacterRoleCleanupInputCharacterSchema.parse(character),
    ) ?? readInputCharacters();
  const prompt = buildPrompt(inputCharacters);
  writeBookFile(
    "generate-roles-and-remove-spoilers-from-summaries-prompt.md",
    prompt,
    FILE_TYPE.TEMPORARY,
  );

  const failures: string[] = [];

  try {
    const normalized = await runProviderWithCoverageCorrection({
      providerName: "Gemini API",
      basePrompt: prompt,
      inputCharacters,
      callWithPrompt: async (providerPrompt) => {
        const result = await callGeminiWithThinkingAndSchemaAndParsed(
          providerPrompt,
          CharacterRoleCleanupResponseSchema,
          MODEL,
          { preferVertex: false },
        );
        return CharacterRoleCleanupResponseSchema.parse(result);
      },
    });
    writeBookFile(OUTPUT_FILE_NAME, JSON.stringify(normalized, null, 2), FILE_TYPE.PERMANENT);
    return normalized;
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const normalized = await runProviderWithCoverageCorrection({
      providerName: "Gemini Vertex",
      basePrompt: prompt,
      inputCharacters,
      callWithPrompt: async (providerPrompt) => {
        const result = await callGeminiWithThinkingAndSchemaAndParsed(
          providerPrompt,
          CharacterRoleCleanupResponseSchema,
          MODEL,
          { preferVertex: true },
        );
        return CharacterRoleCleanupResponseSchema.parse(result);
      },
    });
    writeBookFile(OUTPUT_FILE_NAME, JSON.stringify(normalized, null, 2), FILE_TYPE.PERMANENT);
    return normalized;
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const normalized = await runProviderWithCoverageCorrection({
      providerName: "GPT-5",
      basePrompt: prompt,
      inputCharacters,
      callWithPrompt: async (providerPrompt) => {
        const result = await callGpt5WithSchema(providerPrompt, CharacterRoleCleanupResponseSchema);
        return CharacterRoleCleanupResponseSchema.parse(result);
      },
    });
    writeBookFile(OUTPUT_FILE_NAME, JSON.stringify(normalized, null, 2), FILE_TYPE.PERMANENT);
    return normalized;
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  throw new Error(
    `Failed to generate spoiler-cleaned summaries and roles via all providers. ${failures.join(" | ")}`,
  );
};

if (require.main === module) {
  generateRolesAndRemoveSpoilersFromSummaries()
    .then(() => {
      console.log("Done");
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
