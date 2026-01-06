import OpenAI from "openai";
import "dotenv/config";
import { logger } from "../../logger";
import { getChaptersUpTo } from "../../helpers/getChaptersUpTo";
import { getBookSettings } from "../../helpers/getBookSettings";
import { writeBookFile } from "../../helpers/writeBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { z } from "zod";
import { readBookFile } from "../../helpers/readBookFile";
import { generateFluxImage } from "./generate-flux-schnel-image";
import { GraphicalStyle } from "./create-graphical-style";
import { callSonnet45 } from "../../callSonet45";
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
        const prompt = `Create a visual description of the book chapter provided below.
      This will be used as a prompt for an artist to draw a picture for a background for a chapter of a book during ${genericPrompt.periodStyle}, so make sure it's time appropriate.
      Do not include any plot details, any information about people in the scene, nothing about whats happening.
      Do not include any characters in the scene.
      Do not make it overly detailed. Make it generic, backgroundy, paintely, possibly abstract, atmospheric.
      Describe only ONE scene, if the chapter has multiple scenes, describe the first one.
      Reply with a 2-3 sentences. 
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

  if (FREE_RUN) {
    await Promise.all(
      cleanedPrompts.map(async (prompt) => {
        const fileName = `${outputSubfolder}/flux-schnell-${prompt.chapter}-${prompt.startingParagraph}.png`;
        const imageOpenAi = await generateFluxImage(
          prompt.sceneDescription,
          "skip avatar name",
          genericPrompt.backgroundStyle,
          "background",
          1,
          fileName,
        );
        console.log(imageOpenAi);
      }),
    );
  } else {
    await Promise.all(
      cleanedPrompts.map(async (prompt) => {
        const imageOpenAi = await generateImageWithOpenAIToFolder(
          prompt.sceneDescription,
          prompt.chapter,
          prompt.startingParagraph,
          genericPrompt,
          outputSubfolder,
        );
        console.log(imageOpenAi);
      }),
    );
  }
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
  const fileName = `${outputFolder}/openai-${quality}-${chapter}-${startingParagraph}.webp`;
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

  const prompt = `Create a visual description of the book chapter provided below.
This will be used as a prompt for an artist to draw a picture for a background for a chapter of a book during ${style.periodStyle}, so make sure it's time appropriate.
Do not include any plot details, any information about people in the scene, nothing about whats happening.
Do not include any characters in the scene.
Do not make it overly detailed. Make it generic, backgroundy, paintely, possibly abstract, atmospheric.
Describe only ONE scene, if the chapter has multiple scenes, describe the first one.
Reply with a 2-3 sentences. 
Chapter Text: <chapter>${chapter.content}</chapter>

## Return format:
{
  "sceneDescription": "string",
}`;

  const schema = z.object({ sceneDescription: z.string() });
  const response = await callSlowGeminiWithThinkingAndSchemaAndParsed(prompt, schema);

  const outputFolder = "style-previews";
  const imagePath = await generateImageWithOpenAIToFolder(
    response.sceneDescription,
    chapterNumber,
    0,
    style,
    outputFolder,
  );

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
        const avatarBuffer = await generateCharacterImageWithOpenAI(
          avatarPrompt,
          firstCharacter.name,
          style.avatarStyle,
        );

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
