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
import { generateFluxImage } from "./generate-flux-schnel-image";
import { generateTagName } from "../../helpers/generateTagName";
import {
  callGeminiWithThinking,
  callGeminiWithThinkingAndSchemaAndParsed,
} from "../../callFastGemini";
const FREE_RUN = process.env.FREE_RUN === "true";
const CharactersSchema = z.object({
  characters: z.array(
    z.object({
      name: z.string(), // Character's full name
      visualGuide: z.string(),
    }),
  ),
});

const knowCharactersFromAllPreviousBooks: { name: string; referenceCard: string }[] = [];
const knownCharactersArray = knowCharactersFromAllPreviousBooks.map(({ name }) => name);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const sanitizePromptForModeration = async (prompt: string): Promise<string> => {
  const sanitizationPrompt = `You are a prompt sanitizer. The following image generation prompt was rejected by a safety system for sexual content violations.

Original prompt:
"""
${prompt}
"""

Rewrite this prompt to describe the same character but remove or rephrase any content that could be flagged as sexual, suggestive, or inappropriate. Keep the essential visual characteristics (face, hair, clothing style, age, build, etc.) but make it completely safe for image generation.

Rules:
- Remove any references to nudity, revealing clothing, or suggestive poses
- Remove any romantic or sensual descriptions
- Keep descriptions professional and focused on neutral visual attributes
- If clothing is mentioned, make it modest and appropriate
- Focus on face, expression, and general appearance

Reply ONLY with the sanitized prompt, no explanations or preamble.`;

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
      return await generateCharacterImageWithOpenAI(
        sanitizedPrompt,
        characterName,
        generalPrompt,
        1,
        true,
      );
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
  const imageBuffer = await generateCharacterImageWithOpenAI(prompt, characterName, generalPrompt);
  if (!imageBuffer) return;

  const originalFilePath = getPictureFileNameForName(characterName);
  const filePath = `characters/${originalFilePath}`;
  console.log(`filePath: ${filePath}`);
  writeBookFile(filePath, imageBuffer, FILE_TYPE.PERMANENT);
  logger.info(`Image successfully saved to: ${filePath}`);
};

export const generatePicturePrompts = async (
  referenceCards: NewReferenceCardsResponse,
  options: { skipBookAnalysis?: boolean } = {},
) => {
  const skipBookAnalysis = options.skipBookAnalysis || false;

  const characterNames = referenceCards.characters
    .filter(({ name }) => !knownCharactersArray.includes(name))
    .map((character) => {
      return generateTagName(character.name);
    });
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

    const charactersXml = characterNames.map((name) => `<character name="${name}"/>`).join("\n");
    prompt = initialPrompt
      .replace("{{characters}}", `<characters>${charactersXml}</characters>`)
      .replace("{{bookText}}", bookText);
  }

  const response = await callGeminiWithThinkingAndSchemaAndParsed(prompt, CharactersSchema);
  logger.info(`Response: `, response);
  return response;
};

type CharactersType = z.infer<typeof CharactersSchema>;

export const generatePicturesForEntities = async (
  referenceCards: NewReferenceCardsResponse,
  { skipBookAnalysis = false } = {},
) => {
  let generatedPrompts: CharactersType;
  if (bookFileExists("generated-prompts.json", FILE_TYPE.TEMPORARY)) {
    generatedPrompts = JSON.parse(readBookFile("generated-prompts.json", FILE_TYPE.TEMPORARY));
    console.log("inside generated prompts");
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

        // const translationPrompt = `Process the following draft of a visual prompt: "${prompt.visualGuide}". Remove relations (who is a cousin to who, etc), information about what happens to that person, etc.
        // Remove any indication of episodic things, for example someone getting a bruise later. Leave this as a purely visual information, based on what we know.
        // Remove any indication of nudity, sexual content, etc. Remove suggestions that someone is naked or descriptions of private body parts.
        // If prompt in different language than English, translate it to English.
        // Reply with prompt directly, without any other text, so this can be used directly as a prompt for image generation. Do not say: "Here is the prompt" or "understood", just reply with the prompt.`;
        // const visulGuideTranslatedAndCleaned = await callClaude(translationPrompt, undefined, 10, 0);

        // console.log(visulGuideTranslatedAndCleaned);
        // const image = await generateImage(visulGuideTranslatedAndCleaned, prompt.name);
        // const image = await generateImage(visulGuideTranslatedAndCleaned, prompt.name);
        if (FREE_RUN) {
          const image = await generateFluxImage(
            prompt.visualGuide,
            prompt.name,
            generalPrompt,
            "avatar",
          );
          console.log(`image: ${image}`);
        } else {
          await generateAndSaveCharacterImage(prompt.visualGuide, prompt.name, generalPrompt);
        }
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
