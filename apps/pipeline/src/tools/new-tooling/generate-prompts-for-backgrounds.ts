import OpenAI from "openai";
import "dotenv/config";
import { logger } from "../../logger";
import { getChaptersUpTo } from "../../helpers/getChaptersUpTo";
import { getBookSettings } from "../../helpers/getBookSettings";
import { writeBookFile } from "../../helpers/writeBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { z } from "zod";
import { readBookFile } from "../../helpers/readBookFile";
import {
  generateCharacterImageWithFlux,
  generateImageWithFluxToFolder,
} from "./generate-flux-schnel-image";
import { type GraphicalStyle } from "./create-graphical-style";
import { callSlowGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";
import { generateCharacterImageWithOpenAI } from "./generate-pictures-for-entities";
import { bookFileExists } from "../../helpers/bookFileExists";
import type { NewReferenceCardsResponse } from "../../types";

process.on("unhandledRejection", (reason, promise) => {
  console.error("🚨 Unhandled Rejection at:", promise);
  console.error("Reason:", reason);

  // Optionally, you may want to crash the process
  // (recommended in production so you don’t run in a bad state)
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("🚨 Uncaught Exception:", err);
  process.exit(1);
});

const FREE_RUN = process.env.FREE_RUN === "true";

export type GenericBackgroundPrompt = { backgroundStyle: string; periodStyle: string };

export const generateImageWithOpenAI = async (
  prompt: string,
  chapter: number,
  startingParagraph: number,
  attempt = 1,
  quality: "medium" | "auto" | "standard" | "hd" | "low" | "high" | null | undefined = "medium",
  size:
    | "1536x1024"
    | "1024x1536"
    | "256x256"
    | "512x512"
    | "1792x1024"
    | "1024x1792"
    | "auto"
    | null
    | undefined = "1536x1024",
  genericPrompt: GenericBackgroundPrompt,
  // eslint-disable-next-line max-params
): Promise<undefined> => {
  const finalPrompt = `${genericPrompt.backgroundStyle} ${prompt}`;
  console.log(`Generating image with OpenAI for chapter ${chapter} with prompt: ${finalPrompt}`);
  const openai = new OpenAI();
  let result: (OpenAI.Images.ImagesResponse & { _request_id?: string | null }) | undefined;
  try {
    result = await openai.images.generate({
      model: "gpt-image-1.5",
      prompt: finalPrompt,
      quality,
      size,
      moderation: "low",
      output_format: "webp",
    });
  } catch (e) {
    if (attempt < 3) {
      console.log(`Failed to generate image after ${attempt} attempts`);
      return await generateImageWithOpenAI(
        prompt,
        chapter,
        startingParagraph,
        attempt + 1,
        quality,
        size,
        genericPrompt,
      );
    } else {
      logger.error(`Failed to generate image after 3 attempts: ${JSON.stringify(e)}`);
      return;
    }
  }
  // Save the image to a file
  if (!result?.data?.[0]?.b64_json) {
    logger.error("No image data found");
    return;
  }
  const image_base64 = result.data[0].b64_json;
  const image_bytes = Buffer.from(image_base64, "base64");
  const fileName = `backgrounds/openai-${quality}-${chapter}-${startingParagraph}.webp`;
  const filePath = writeBookFile(fileName, image_bytes, FILE_TYPE.PERMANENT);
  logger.info(`Image successfully saved to: ${filePath}`);
};

export type GenerateBackgroundsOptions = {
  customStyle?: GraphicalStyle;
  chapterNumbers?: number[];
  outputSubfolder?: string;
  skipCache?: boolean;
};

export const generateBackgrounds = async (options: GenerateBackgroundsOptions = {}) => {
  if (FREE_RUN) {
    logger.info("FREE_RUN enabled - skipping background generation.");
    return;
  }

  const {
    customStyle,
    chapterNumbers,
    outputSubfolder = "backgrounds",
    skipCache = false,
  } = options;

  const bookSettings = getBookSettings();
  let chapters = getChaptersUpTo(
    bookSettings.startFromChapter || 1,
    bookSettings.startFromChapter + bookSettings.numberOfChaptersToProcess - 1,
  );

  if (chapterNumbers && chapterNumbers.length > 0) {
    chapters = chapters.filter((c) => chapterNumbers.includes(c.number));
  }

  const genericPrompt =
    customStyle ??
    (JSON.parse(readBookFile("graphicalStyle.json", FILE_TYPE.TEMPORARY)) as GraphicalStyle);

  let cleanedPrompts: { chapter: number; sceneDescription: string; startingParagraph: number }[] =
    [];

  let initialPrompts: {
    chapter: number;
    response: { sceneDescription: string; startingParagraph: number }[];
  }[] = [];

  if (!skipCache) {
    try {
      initialPrompts = JSON.parse(readBookFile("initial-prompts.json", FILE_TYPE.TEMPORARY));
      if (chapterNumbers && chapterNumbers.length > 0) {
        initialPrompts = initialPrompts.filter((p) => chapterNumbers.includes(p.chapter));
      }
    } catch {
      console.log("No initial prompts found, generating new ones");
    }
  }

  const chaptersNeedingPrompts = chapters.filter(
    (c) => !initialPrompts.some((p) => p.chapter === c.number),
  );

  if (chaptersNeedingPrompts.length > 0) {
    const newPrompts = await Promise.all(
      chaptersNeedingPrompts.map(async (chapter) => {
        const prompt = `Create a visual description for an ebook background image.
This will be used during ${genericPrompt.periodStyle}, so make it time appropriate.

CRITICAL RULES:
- This is a BACKGROUND for reading text, not a standalone illustration
- NO characters, people, or figures in the scene
- NO plot details or action happening
- Describe only ONE scene (the first if chapter has multiple)

CAMERA & COMPOSITION:
- For OUTDOOR scenes: Use a wide establishing shot or bird's eye view
- For INDOOR scenes: Position camera far back for a wide shot of the room
- Avoid close-ups of cluttered surfaces (desks with papers, tables with many objects)
- Prefer simple, clean compositions with atmospheric depth
- If showing a room interior, focus on architectural space not object clutter

Keep description to 2-3 sentences. Be generic, atmospheric, painterly.

Chapter Text: <chapter>${chapter.content}</chapter>

## Return format:
{
  "sceneDescription": "string",
}`;

        const schema = z.object({ sceneDescription: z.string() });
        const response = await callSlowGeminiWithThinkingAndSchemaAndParsed(prompt, schema);
        console.log(`${chapter.number} - ${JSON.stringify(response)}`);
        return {
          chapter: chapter.number,
          response: [{ sceneDescription: response.sceneDescription, startingParagraph: 0 }],
        };
      }),
    );
    initialPrompts = [...initialPrompts, ...newPrompts];
  }

  if (!chapterNumbers || chapterNumbers.length === 0) {
    writeBookFile(
      "initial-prompts.json",
      JSON.stringify(initialPrompts, null, 2),
      FILE_TYPE.TEMPORARY,
    );
  }

  cleanedPrompts = initialPrompts.flatMap((p) =>
    p.response.map((r: { sceneDescription: string; startingParagraph: number }) => ({
      chapter: p.chapter,
      sceneDescription: r.sceneDescription,
      startingParagraph: r.startingParagraph,
    })),
  );

  console.log(`Cleaned prompts: ${JSON.stringify(cleanedPrompts)}`);

  const generator = FREE_RUN ? generateImageWithFluxToFolder : generateImageWithOpenAIToFolder;
  genericPrompt.backgroundStyle = `${genericPrompt.backgroundStyle}\n\n## Scene description\n\n`;

  await Promise.all(
    cleanedPrompts.map(async (prompt) => {
      const imagePath = await generator(
        prompt.sceneDescription,
        prompt.chapter,
        prompt.startingParagraph,
        genericPrompt,
        outputSubfolder,
      );
      console.log(imagePath);
    }),
  );
};

export const generateImageWithOpenAIToFolder = async (
  prompt: string,
  chapter: number,
  startingParagraph: number,
  genericPrompt: GenericBackgroundPrompt,
  outputFolder: string,
  attempt = 1,
  quality: "medium" | "auto" | "standard" | "hd" | "low" | "high" | null | undefined = "medium",
  size:
    | "1536x1024"
    | "1024x1536"
    | "256x256"
    | "512x512"
    | "1792x1024"
    | "1024x1792"
    | "auto"
    | null
    | undefined = "1536x1024",
  suffix?: string,
  // eslint-disable-next-line max-params
): Promise<string | undefined> => {
  const finalPrompt = `${genericPrompt.backgroundStyle} ${prompt}`;
  console.log(`Generating image with OpenAI for chapter ${chapter} with prompt: ${finalPrompt}`);
  const openai = new OpenAI();
  let result: (OpenAI.Images.ImagesResponse & { _request_id?: string | null }) | undefined;
  try {
    result = await openai.images.generate({
      model: "gpt-image-1.5",
      prompt: finalPrompt,
      quality,
      size,
      moderation: "low",
      output_format: "webp",
    });
  } catch (e) {
    if (attempt < 3) {
      console.log(`Failed to generate image after ${attempt} attempts`);
      return await generateImageWithOpenAIToFolder(
        prompt,
        chapter,
        startingParagraph,
        genericPrompt,
        outputFolder,
        attempt + 1,
        quality,
        size,
        suffix,
      );
    } else {
      logger.error(`Failed to generate image after 3 attempts: ${JSON.stringify(e)}`);
      return undefined;
    }
  }

  if (!result?.data?.[0]?.b64_json) {
    logger.error("No image data found");
    return undefined;
  }
  const image_base64 = result.data[0].b64_json;
  const image_bytes = Buffer.from(image_base64, "base64");
  const fileName = suffix
    ? `${outputFolder}/openai-${quality}-${chapter}-${startingParagraph}-${suffix}.webp`
    : `${outputFolder}/openai-${quality}-${chapter}-${startingParagraph}.webp`;
  const filePath = writeBookFile(fileName, image_bytes, FILE_TYPE.PERMANENT);
  logger.info(`Image successfully saved to: ${filePath}`);
  return filePath;
};

export type StylePreviewResult = {
  imagePath: string;
  avatarPath: string | null;
  styleType: "auto" | "user";
};

export const generateStylePreview = async (
  style: GraphicalStyle,
  styleType: "auto" | "user",
  chapterNumber = 1,
): Promise<StylePreviewResult | undefined> => {
  const bookSettings = getBookSettings();
  const chapters = getChaptersUpTo(
    bookSettings.startFromChapter || 1,
    bookSettings.startFromChapter + bookSettings.numberOfChaptersToProcess - 1,
  );
  const chapter = chapters.find((c) => c.number === chapterNumber);

  if (!chapter) {
    logger.error(`Chapter ${chapterNumber} not found`);
    return undefined;
  }

  const prompt = `Create a visual description for an ebook background image.
This will be used during ${style.periodStyle}, so make it time appropriate.

CRITICAL RULES:
- This is a BACKGROUND for reading text, not a standalone illustration
- NO characters, people, or figures in the scene
- NO plot details or action happening
- Describe only ONE scene (the first if chapter has multiple)

CAMERA & COMPOSITION:
- For OUTDOOR scenes: Use a wide establishing shot or bird's eye view
- For INDOOR scenes: Position camera far back for a wide shot of the room
- Avoid close-ups of cluttered surfaces (desks with papers, tables with many objects)
- Prefer simple, clean compositions with atmospheric depth
- If showing a room interior, focus on architectural space not object clutter

Keep description to 2-3 sentences. Be generic, atmospheric, painterly.

Chapter Text: <chapter>${chapter.content}</chapter>

## Return format:
{
  "sceneDescription": "string",
}`;

  const schema = z.object({ sceneDescription: z.string() });
  const response = await callSlowGeminiWithThinkingAndSchemaAndParsed(prompt, schema);

  const outputFolder = "style-previews";
  const generator = FREE_RUN ? generateImageWithFluxToFolder : generateImageWithOpenAIToFolder;
  style.backgroundStyle = `${style.backgroundStyle}\n\n## Scene description\n\n`;
  const imagePath = (await generator(
    response.sceneDescription,
    chapterNumber,
    0,
    style,
    outputFolder,
    1, // attempt
    "medium", // quality
    "1536x1024", // size
    styleType, // suffix to prevent race condition
  )) as string;

  if (!imagePath) {
    return undefined;
  }

  const fs = await import("fs");
  const path = await import("path");

  const finalFileName = `${styleType}-preview-chapter-${chapterNumber}.webp`;
  const targetPath = path.join(path.dirname(imagePath), finalFileName);

  try {
    if (imagePath !== targetPath) {
      fs.renameSync(imagePath, targetPath);
    }
  } catch (e) {
    logger.error(`Failed to rename preview file: ${e}`);
  }

  const backgroundPath = fs.existsSync(targetPath) ? targetPath : imagePath;

  let avatarPath: string | null = null;
  try {
    if (bookFileExists("single-summary-per-person.json", FILE_TYPE.PERMANENT)) {
      const referenceCards = JSON.parse(
        readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT),
      ) as NewReferenceCardsResponse;

      if (referenceCards.characters && referenceCards.characters.length > 0) {
        const firstCharacter = referenceCards.characters[0];
        logger.info(`Generating avatar preview for character: ${firstCharacter.name}`);

        const avatarPrompt = `Portrait of ${firstCharacter.name}. ${firstCharacter.referenceCard}`;

        const generator = FREE_RUN
          ? generateCharacterImageWithFlux
          : generateCharacterImageWithOpenAI;
        const avatarBuffer = await generator(avatarPrompt, firstCharacter.name, style.avatarStyle);

        if (avatarBuffer) {
          const avatarFileName = `${styleType}-preview-avatar.webp`;
          const avatarTargetPath = path.join(path.dirname(backgroundPath), avatarFileName);
          fs.writeFileSync(avatarTargetPath, avatarBuffer);
          avatarPath = avatarTargetPath;
          logger.info(`Avatar preview saved to: ${avatarPath}`);
        }
      }
    }
  } catch (e) {
    logger.error(`Failed to generate avatar preview: ${e}`);
  }

  return { imagePath: backgroundPath, avatarPath, styleType };
};

if (require.main === module) {
  generateBackgrounds();
}
