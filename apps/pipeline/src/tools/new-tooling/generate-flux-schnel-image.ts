import Replicate from "replicate";
import { writeBookFile } from "../../helpers/writeBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { logger } from "../../logger";
import type { GenericBackgroundPrompt } from "./generate-prompts-for-backgrounds";
import {
  lightSanitizePrompt,
  sanitizePromptForModeration,
  generateAbstractPortraitPrompt,
} from "./generate-pictures-for-entities";
import { logError } from "src/helpers/logError";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export const generateImageWithFluxToFolder = async (
  sceneDescription: string,
  chapter: number,
  startingParagraph: number,
  abstractPrompt: GenericBackgroundPrompt,
  outputFolder: string,
  attempt = 1,
  _quality: "medium" | "auto" | "standard" | "hd" | "low" | "high" | null | undefined = "medium",
  _size:
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
) => {
  const filename = suffix
    ? `${outputFolder}/openai-medium-${chapter}-${startingParagraph}-${suffix}.webp`
    : `${outputFolder}/openai-medium-${chapter}-${startingParagraph}.webp`;
  return generateFluxImage(
    sceneDescription,
    "",
    abstractPrompt.backgroundStyle,
    "background",
    filename,
    attempt,
  );
};

export const generateCharacterImageWithFlux = async (
  prompt: string,
  characterName: string,
  generalPrompt: string,
  attempt = 1,
): Promise<Buffer | undefined> => {
  return generateFluxImage(
    prompt,
    characterName,
    generalPrompt,
    "avatar",
    undefined,
    attempt,
    true,
  ) as Promise<Buffer | undefined>;
};

/**
 * Generate character image with metadata about which attempt succeeded.
 * Use this when you need to track sanitization level for verification.
 */
export const generateCharacterImageWithFluxAndMetadata = async (
  prompt: string,
  characterName: string,
  generalPrompt: string,
): Promise<
  | {
      buffer: Buffer;
      attempt: number;
      sanitizationLevel: "original" | "light" | "heavy" | "abstract";
    }
  | undefined
> => {
  const buffer = await generateFluxImage(
    prompt,
    characterName,
    generalPrompt,
    "avatar",
    undefined,
    1,
    true,
  );
  if (!buffer) {
    return undefined;
  }
  return { buffer: buffer as Buffer, attempt: 1, sanitizationLevel: "original" };
};

type PictureType = "avatar" | "background";
export const generateFluxImage = async (
  prompt: string,
  characterName: string,
  generalPrompt: string,
  type: PictureType,
  filePath?: string,
  attempt = 1,
  returnBuffer = false,
  // eslint-disable-next-line max-params
): Promise<string | Buffer | undefined> => {
  let finalPrompt;
  if (type === "avatar") {
    switch (attempt) {
      case 1:
        // Attempt 1: Original prompt with character name
        finalPrompt = `${generalPrompt} ${prompt} ${characterName}`;
        break;
      case 2: {
        // Attempt 2: Light sanitization (regex-based) without character name
        const lightSanitized = lightSanitizePrompt(prompt);
        console.log(`[Flux] Attempt 2 - light sanitization for ${characterName}`);
        finalPrompt = `${generalPrompt} ${lightSanitized}`;
        break;
      }
      case 3: {
        // Attempt 3: Heavy sanitization (LLM rewrite)
        console.log(`[Flux] Attempt 3 - heavy sanitization (LLM) for ${characterName}`);
        const sanitizedPrompt = await sanitizePromptForModeration(prompt);
        finalPrompt = `${generalPrompt} ${sanitizedPrompt}`;
        break;
      }
      default:
      case 4: {
        // Attempt 4: AI-generated abstract fallback based on character name only
        console.log(`[Flux] Attempt 4 - AI abstract fallback for ${characterName}`);
        const abstractPrompt = await generateAbstractPortraitPrompt(characterName);
        finalPrompt = `${generalPrompt} ${abstractPrompt}`;
        break;
      }
    }
  } else {
    finalPrompt = `${generalPrompt} Only scene-setting environment. ${prompt}`;
  }

  // this is input for flux-2-pro
  // const input = {
  //   aspect_ratio: type === "avatar" ? "1:1" : "16:9",
  //   input_images: [],
  //   output_format: type === "background" ? "webp" : "png",
  //   output_quality: 80,
  //   prompt: finalPrompt,
  //   resolution: "1 MP",
  //   safety_tolerance: 5,
  //   seed: 43605,
  // };

  const input = {
    images: [],
    prompt: finalPrompt,
    go_fast: false,
    aspect_ratio: type === "avatar" ? "1:1" : "16:9",
    output_format: type === "background" ? "webp" : "png",
    output_quality: 80,
    output_megapixels: "1",
    disable_safety_checker: true,
  };

  try {
    const output = await replicate.run("black-forest-labs/flux-2-klein-4b", { input });

    let url: string;
    try {
      // @ts-expect-error wrong types of replicate - flux-2-pro returns object with .url() method
      url = output.url();
    } catch {
      try {
        url = (output as unknown as { url: () => string }[])[0].url();
      } catch (e) {
        logError("Failed to get URL from output", e);
      }
    }

    if (!url!) {
      throw new Error("Failed to get URL from output");
    }

    logger.info(`Replicate returned URL: ${url}`);

    // Download the image and save it to the book output folder
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download image: ${res.status} ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (returnBuffer) {
      return buffer;
    }
    if (filePath) {
      const absolutePath = writeBookFile(filePath, buffer, FILE_TYPE.PERMANENT);
      logger.info(`Image saved: ${absolutePath}`);
      return absolutePath;
    }
    return undefined;
  } catch (e) {
    console.error(`Failed to generate/download image on attempt ${attempt}: ${e}`);
    if (attempt < 4) {
      return await generateFluxImage(
        prompt,
        characterName,
        generalPrompt,
        type,
        filePath,
        attempt + 1,
        returnBuffer,
      );
    } else {
      logger.error(
        `Failed to generate image after 4 attempts for prompt: ${characterName} ${prompt}`,
      );
      return undefined;
    }
  }
};

if (require.main === module) {
  generateFluxImage(
    "A beautiful woman with long brown hair and blue eyes, seductive pose, naked, red lips, sexy, elegant, beautiful, 18 years old, breasts exposed",
    "test",
    "SinCity style",
    "avatar",
    "test.webp",
  ).then((image) => {
    console.log(`image: ${image}`);
  });
}
