import { logger } from "../../logger";
import OpenAI from "openai";
import "dotenv/config";

import fs from "fs";
import { z } from "zod";
import { getPictureFileNameForName } from "../../helpers/getPictureFileNameForName";
import { readBookFile } from "../../helpers/readBookFile";
import { getChaptersUpTo } from "../../helpers/getChaptersUpTo";
import { getBookSettings } from "../../helpers/getBookSettings";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { bookFileExists } from "../../helpers/bookFileExists";
import { writeBookFile } from "../../helpers/writeBookFile";
import { type NewReferenceCardsResponse } from "../../types";
import { generateCharacterImageWithFlux } from "./generate-flux-schnel-image";
import { generateTagName } from "../../helpers/generateTagName";
import {
  callGeminiWithThinking,
  callGeminiWithThinkingAndSchemaAndParsed,
} from "../../callFastGemini";
import {
  buildShadowCandidateFromReferenceCards,
  buildVisualGuideExperimentRunId,
  normalizeCharacterName,
  writeVisualGuideExperimentArtifacts,
} from "./visual-guide-experiment";
const FREE_RUN = process.env.FREE_RUN === "true";
const CharactersSchema = z.object({
  characters: z.array(
    z.object({
      name: z.string(), // Character's full name
      visualGuide: z.string(),
    }),
  ),
});

type CharactersType = z.infer<typeof CharactersSchema>;
type VisualGuideExperimentMode = "off" | "ac-shadow";

type GeneratePicturePromptsOptions = {
  skipBookAnalysis?: boolean;
  experimentMode?: VisualGuideExperimentMode;
  experimentRunId?: string;
};

const knowCharactersFromAllPreviousBooks: { name: string; referenceCard: string }[] = [];
const knownCharactersArray = knowCharactersFromAllPreviousBooks.map(({ name }) => name);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Light sanitization (attempt 2): Quick regex-based replacements for obvious triggers.
 * Preserves most of the original description while removing the most problematic words.
 */
export const lightSanitizePrompt = (prompt: string): string => {
  return (
    prompt
      // Religious terms -> neutral alternatives
      .replace(/\bgod\b/gi, "divine being")
      .replace(/\bsatan\b/gi, "dark lord")
      .replace(/\bdevil\b/gi, "dark figure")
      .replace(/\bdemon\b/gi, "dark spirit")
      .replace(/\bangel\b/gi, "celestial being")
      .replace(/\blucifer\b/gi, "fallen one")
      // Nudity -> clothed
      .replace(/\bnaked\b/gi, "in flowing robes")
      .replace(/\bnude\b/gi, "in simple garments")
      .replace(/\bunclothed\b/gi, "draped in fabric")
      // Violence -> neutral
      .replace(/\bblood\b/gi, "crimson")
      .replace(/\bbesmeared with crimson\b/gi, "wearing deep red")
      .replace(/\bgore\b/gi, "red coloring")
      .replace(/\bdeath\b/gi, "shadow")
      // Monsters -> humanized
      .replace(/\bmonster\b/gi, "imposing figure")
      .replace(/\bfish.?tail\b/gi, "aquatic-themed robes")
      .replace(/\bserpent\b/gi, "scaled")
      // Weapons -> ceremonial
      .replace(/\bsword\b/gi, "staff")
      .replace(/\bweapon/gi, "implement")
      .replace(/\barmou?r\b/gi, "ceremonial attire")
  );
};

/**
 * Abstract fallback (attempt 4): Generate an abstract/symbolic representation
 * inspired by the character name, avoiding any literal depiction.
 */
export const generateAbstractPortraitPrompt = async (characterName: string): Promise<string> => {
  const abstractPrompt = `Create an ABSTRACT, SYMBOLIC visual description inspired by the name "${characterName}".

This is NOT a portrait of a person. Instead, create an abstract or symbolic representation.

Examples of what you might describe:
- For a powerful name: "Rays of golden light emanating from clouds"
- For a dark name: "Swirling shadows with hints of deep purple"
- For a nature name: "Flowing water patterns with soft blue tones"
- For a fiery name: "Abstract warm gradients suggesting heat and energy"

Rules:
- NO people, faces, figures, or humanoid shapes
- NO religious, mythological, or controversial imagery
- Think abstract art, light, color, shapes, patterns, nature elements
- Keep it safe for any AI image generator
- Under 25 words

Reply ONLY with the abstract description. No explanations.`;

  const result = await callGeminiWithThinking(abstractPrompt);
  console.log(`Abstract prompt for ${characterName}: ${result}`);
  return result || `Abstract patterns of light and shadow with flowing organic shapes.`;
};

/**
 * Heavy sanitization (attempt 3): Full LLM rewrite to bypass content filters
 * while preserving the character's essence.
 */
export const sanitizePromptForModeration = async (prompt: string): Promise<string> => {
  const sanitizationPrompt = `You are a prompt sanitizer for AI image generation. The following prompt was rejected by a safety system. Your job is to rewrite it to bypass content filters while preserving the character's essence.

Original prompt:
"""
${prompt}
"""

Rewrite this prompt following these rules:

## Religious/Mythological Figures
- Never use names like "god", "satan", "devil", "demon", "angel" directly
- Use euphemisms: "divine celestial being", "dark ethereal lord", "fallen celestial", "winged messenger", "infernal spirit"
- For biblical figures: "the first woman" instead of "Eve", "the first man" instead of "Adam"

## Nudity (even non-sexual/classical)
- Replace "naked", "nude", "unclothed" with clothing descriptions
- Use: "draped in flowing white fabric", "wearing simple robes"
- For innocence themes: "wearing pure white garments" or "dressed in ethereal flowing cloth"

## Violence/Gore
- Remove all references to blood, wounds, gore, killing
- Replace "besmeared with blood" → "wearing deep crimson robes"
- Replace "warrior" → "noble figure in ceremonial attire"
- Replace weapons with symbolic objects: "carrying a staff" instead of "wielding a sword"

## Monsters/Hybrids
- Humanize the description, remove monster terminology
- "Sea creature with fish tail" → "dignified figure with aquatic-themed decorative robes in oceanic blues and greens"
- Focus on human features, add thematic clothing/accessories instead of non-human body parts

## Military/Weapons
- Replace armor → "formal ceremonial attire" or "ornate robes"
- Replace weapons → "carrying a ceremonial staff" or "holding a symbolic object"
- Replace "trophies of war" → "decorative medallions"

## General
- Keep the character's essential personality (stern, gentle, wise, etc.)
- Preserve hair color, eye color, build, age
- Focus on face, expression, posture, and clothing
- Make it sound like a portrait commission

Reply ONLY with the sanitized prompt. No explanations.`;

  const sanitizedPrompt = await callGeminiWithThinking(sanitizationPrompt);
  console.log(`Sanitized prompt for moderation: ${sanitizedPrompt}`);
  return sanitizedPrompt || prompt;
};

// const generateCharacterImageWithGemini = async ()
//   prompt: string,
//   characterName: string,
//   generalPrompt: string,
//   attempt = 1,
//   useSanitizedPrompt = false,
// ) => {
//   const response = await callGeminiWithThinkingAndSchemaAndParsed(prompt, CharactersSchema);
// };

export const generateCharacterImageWithOpenAI = async (
  prompt: string,
  characterName: string,
  generalPrompt: string,
  attempt = 1,
  useSanitizedPrompt = false,
): Promise<Buffer | null> => {
  const openai = new OpenAI();

  console.log(
    `Generating image for character ${characterName} with prompt: ${prompt}${useSanitizedPrompt ? " (sanitized)" : ""}`,
  );
  const finalPrompt = `${generalPrompt}\n ${characterName} \n${prompt}`;

  let result: (OpenAI.Images.ImagesResponse & { _request_id?: string | null }) | undefined;
  try {
    result = await openai.images.generate({
      model: "gpt-image-1.5",
      prompt: finalPrompt,
      quality: "medium",
      size: "1024x1024",
      moderation: "low",
    });
  } catch (e: unknown) {
    const error = e as { code?: string };
    const isModerationBlocked = error?.code === "moderation_blocked";

    if (isModerationBlocked && !useSanitizedPrompt) {
      console.log(`Moderation blocked for ${characterName}, sanitizing prompt with Gemini...`);
      const sanitizedPrompt = await sanitizePromptForModeration(prompt);
      return await generateCharacterImageWithOpenAI(sanitizedPrompt, "", generalPrompt, 1, true);
    }

    if (attempt < 3) {
      const waitTime = attempt * 30000 - 15000;
      console.log(
        `Failed to generate image after ${attempt} attempts, waiting ${waitTime} ms`,
        JSON.stringify(e),
      );
      await sleep(waitTime);
      return await generateCharacterImageWithOpenAI(
        prompt,
        characterName,
        generalPrompt,
        attempt + 1,
        useSanitizedPrompt,
      );
    } else {
      logger.error("Failed to generate image after 3 attempts");
      return null;
    }
  }

  if (!result?.data?.[0]?.b64_json) {
    logger.error("No image data found");
    return null;
  }

  return Buffer.from(result.data[0].b64_json, "base64");
};

const generateAndSaveCharacterImage = async (
  prompt: string,
  characterName: string,
  generalPrompt: string,
): Promise<void> => {
  const generator = FREE_RUN ? generateCharacterImageWithFlux : generateCharacterImageWithOpenAI;
  const imageBuffer = await generator(prompt, characterName, generalPrompt);
  if (!imageBuffer) return;

  const originalFilePath = getPictureFileNameForName(characterName);
  const filePath = `characters/${originalFilePath}`;
  console.log(`filePath: ${filePath}`);
  writeBookFile(filePath, imageBuffer, FILE_TYPE.PERMANENT);
  logger.info(`Image successfully saved to: ${filePath}`);
};

export const generatePicturePrompts = async (
  referenceCards: NewReferenceCardsResponse,
  options: GeneratePicturePromptsOptions = {},
) => {
  const skipBookAnalysis = options.skipBookAnalysis || false;
  const experimentMode = options.experimentMode || "off";
  const characterNames = referenceCards.characters
    .filter(({ name }) => !knownCharactersArray.includes(name))
    .map((character) => normalizeCharacterName(character.name));
  const requestedCharacterNames = Array.from(
    new Set(characterNames.filter((name) => name !== "generic-avatar")),
  );
  logger.info(`Generating pictures for ${characterNames} characters`);
  const initialPrompt = fs.readFileSync(`${__dirname}/generate-images-prompt.md`, "utf8");

  let prompt: string;

  if (skipBookAnalysis) {
    const charactersXml = characterNames
      .map(
        (name) =>
          `<character name="${name}" description="${referenceCards.characters.find((character) => generateTagName(character.name) === name)?.referenceCard}"/>`,
      )
      .join("\n");
    prompt = initialPrompt
      .replace("{{characters}}", `<characters>${charactersXml}</characters>`)
      .replace("{{bookText}}", "");
    console.log(prompt);
    throw new Error("temporary error");
  } else {
    const bookSettings = getBookSettings();

    const chapters = getChaptersUpTo(
      bookSettings.startFromChapter,
      bookSettings.startFromChapter + bookSettings.numberOfChaptersToProcess - 1,
    );
    const bookText = `<chapters>
${chapters
  .map(
    (chapter) =>
      `<chapter number="${chapter.number}"><title>${chapter.title}</title><content>${chapter.content}</content></chapter>`,
  )
  .join("\n")}
</chapters>`;

    const charactersXml = requestedCharacterNames
      .map((name) => `<character name="${name}"/>`)
      .join("\n");
    prompt = initialPrompt
      .replace("{{characters}}", `<characters>${charactersXml}</characters>`)
      .replace("{{bookText}}", bookText);
  }

  const response = (await callGeminiWithThinkingAndSchemaAndParsed(
    prompt,
    CharactersSchema,
  )) as CharactersType;
  logger.info(`Response: `, response);
  response.characters.push({
    name: "generic-avatar",
    visualGuide:
      "A mysterious figure shown from behind or in silhouette. No distinct facial features visible. Anonymous, sexless, suitable for representing any unnamed character. Atmospheric lighting with the figure partially obscured by shadow or mist.",
  });

  if (experimentMode === "ac-shadow") {
    const runId = options.experimentRunId || buildVisualGuideExperimentRunId();
    const cOutput = buildShadowCandidateFromReferenceCards(referenceCards, requestedCharacterNames);
    writeVisualGuideExperimentArtifacts(runId, requestedCharacterNames, response, cOutput);
  }

  return response;
};

export const generatePicturesForEntities = async (
  referenceCards: NewReferenceCardsResponse,
  { skipBookAnalysis = false } = {},
) => {
  let generatedPrompts: CharactersType;
  if (bookFileExists("generated-prompts.json", FILE_TYPE.TEMPORARY)) {
    generatedPrompts = JSON.parse(readBookFile("generated-prompts.json", FILE_TYPE.TEMPORARY));
    console.log("[generatePicturesForEntities] Using cached generated-prompts.json");
    console.log(
      "[generatePicturesForEntities] Cached characters:",
      generatedPrompts.characters.map((c) => c.name),
    );
    console.log(
      "[generatePicturesForEntities] Reference cards characters:",
      referenceCards.characters.map((c) => c.name),
    );
  } else {
    generatedPrompts = await generatePicturePrompts(referenceCards, { skipBookAnalysis });
    writeBookFile(
      "generated-prompts.json",
      JSON.stringify(generatedPrompts, null, 2),
      FILE_TYPE.TEMPORARY,
    );
  }

  let generalPrompt: string;
  if (bookFileExists("graphicalStyle.json", FILE_TYPE.TEMPORARY)) {
    generalPrompt = JSON.parse(
      readBookFile("graphicalStyle.json", FILE_TYPE.TEMPORARY),
    ).avatarStyle;
  } else {
    generalPrompt = `Avatar for a character in an ebook. Expressionist Graphic Noir
Frank Miller's *Sin City* style. extreme black-and-white contrast with splashes of color
Mid-century film noir cinematography.
Propaganda posters for their graphic boldness and limited color palette.
`;
  }

  const filteredPrompts = generatedPrompts.characters.filter(
    ({ name }) => !knownCharactersArray.includes(name),
  );
  console.log("filteredPrompts", filteredPrompts);
  await Promise.all(
    filteredPrompts.map(async (prompt) => {
      if (!knownCharactersArray.includes(prompt.name)) {
        console.log("Generating for ", prompt.name);
        await generateAndSaveCharacterImage(prompt.visualGuide, prompt.name, generalPrompt);
      }
    }),
  );
};

if (require.main === module) {
  const referenceCards = JSON.parse(
    readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT),
  ) as NewReferenceCardsResponse;
  generatePicturesForEntities(referenceCards, { skipBookAnalysis: true }).then(() => {
    logger.info("Done");
    process.exit(0);
  });
}
