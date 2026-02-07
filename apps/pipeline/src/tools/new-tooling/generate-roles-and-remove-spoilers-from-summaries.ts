import fs from "fs";
import path from "path";
import { z } from "zod";
import { callGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";
import { callGpt5WithSchema } from "../../callGpt5";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { readBookFile } from "../../helpers/readBookFile";
import { writeBookFile } from "../../helpers/writeBookFile";
import { type NewReferenceCardsResponse } from "../../types";
import { NewReferenceCardsResponseSchema } from "../../schemes";

const INPUT_FILE_NAME = "single-summary-per-person.json";
const OUTPUT_FILE_NAME = "single-summary-per-person-roles.json";
const MODEL = "gemini-3-flash-preview";
const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;
const MAX_ATTEMPTS_PER_PROVIDER = 4;

const CharacterRoleCleanupSchema = z.object({
  name: z.string(),
  referenceCard: z.string(),
  role: z.string().nullable().optional(),
});

const CharacterRoleCleanupResponseSchema = z.object({
  characters: z.array(CharacterRoleCleanupSchema),
});

export type CharacterRoleCleanupResponse = z.infer<typeof CharacterRoleCleanupResponseSchema>;

type InputCharacter = { name: string; referenceCard: string };

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

function readInputCharacters(): InputCharacter[] {
  const parsed = JSON.parse(readBookFile(INPUT_FILE_NAME, FILE_TYPE.PERMANENT)) as unknown;
  const validated = NewReferenceCardsResponseSchema.parse(parsed) as NewReferenceCardsResponse;
  return validated.characters.map((character) => ({
    name: character.name,
    referenceCard: character.referenceCard,
  }));
}

function buildPrompt(characters: InputCharacter[]): string {
  const template = fs.readFileSync(
    path.join(__dirname, "generate-roles-and-remove-spoilers-from-summaries.md"),
    "utf8",
  );
  const payload = JSON.stringify({ characters }, null, 2);

  return `${template}\n\`\`\`json\n${payload}\n\`\`\`\n`;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function ensureCoverageAndOrder(
  inputCharacters: InputCharacter[],
  response: CharacterRoleCleanupResponse,
): CharacterRoleCleanupResponse {
  const responseByName = new Map<string, { referenceCard: string; role: string | null }>();
  for (const character of response.characters) {
    const normalized = normalizeName(character.name);
    if (!normalized || responseByName.has(normalized)) {
      continue;
    }
    responseByName.set(normalized, {
      referenceCard: character.referenceCard.trim(),
      role: character.role?.trim() || null,
    });
  }

  const missingNames: string[] = [];
  const orderedCharacters = inputCharacters.map((character) => {
    const normalized = normalizeName(character.name);
    const fromResponse = responseByName.get(normalized);
    if (!fromResponse) {
      missingNames.push(character.name);
      return { name: character.name, referenceCard: character.referenceCard, role: null };
    }

    return {
      name: character.name,
      referenceCard: fromResponse.referenceCard,
      role: fromResponse.role,
    };
  });

  if (missingNames.length > 0) {
    throw new Error(
      `Spoiler cleanup response missing ${missingNames.length} characters: ${missingNames.join(", ")}`,
    );
  }

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

export const generateRolesAndRemoveSpoilersFromSummaries =
  async (): Promise<CharacterRoleCleanupResponse> => {
    const inputCharacters = readInputCharacters();
    const prompt = buildPrompt(inputCharacters);
    writeBookFile(
      "generate-roles-and-remove-spoilers-from-summaries-prompt.md",
      prompt,
      FILE_TYPE.TEMPORARY,
    );

    const failures: string[] = [];

    try {
      const geminiResult = await runProviderWithRetries("Gemini API", async () => {
        const result = await callGeminiWithThinkingAndSchemaAndParsed(
          prompt,
          CharacterRoleCleanupResponseSchema,
          MODEL,
          { preferVertex: false },
        );
        return CharacterRoleCleanupResponseSchema.parse(result);
      });
      const normalized = ensureCoverageAndOrder(inputCharacters, geminiResult);
      writeBookFile(OUTPUT_FILE_NAME, JSON.stringify(normalized, null, 2), FILE_TYPE.PERMANENT);
      return normalized;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }

    try {
      const vertexResult = await runProviderWithRetries("Gemini Vertex", async () => {
        const result = await callGeminiWithThinkingAndSchemaAndParsed(
          prompt,
          CharacterRoleCleanupResponseSchema,
          MODEL,
          { preferVertex: true },
        );
        return CharacterRoleCleanupResponseSchema.parse(result);
      });
      const normalized = ensureCoverageAndOrder(inputCharacters, vertexResult);
      writeBookFile(OUTPUT_FILE_NAME, JSON.stringify(normalized, null, 2), FILE_TYPE.PERMANENT);
      return normalized;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }

    try {
      const gpt5Result = await runProviderWithRetries("GPT-5", async () => {
        const result = await callGpt5WithSchema(prompt, CharacterRoleCleanupResponseSchema);
        return CharacterRoleCleanupResponseSchema.parse(result);
      });
      const normalized = ensureCoverageAndOrder(inputCharacters, gpt5Result);
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
