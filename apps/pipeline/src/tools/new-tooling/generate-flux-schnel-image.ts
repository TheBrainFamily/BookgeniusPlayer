import Replicate from "replicate";
import { writeBookFile } from "../../helpers/writeBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { logger } from "../../logger";
import { getFilePath } from "../../helpers/filesHelpers";
import type { GenericBackgroundPrompt } from "./generate-prompts-for-backgrounds";
import { sanitizePromptForModeration } from "./generate-pictures-for-entities";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export const generateImageWithFluxToFolder = async (
  sceneDescription: string,
  chapter: number,
  startingParagraph: number,
  genericPrompt: GenericBackgroundPrompt,
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
  // eslint-disable-next-line max-params
) =>
  generateFluxImage(
    sceneDescription,
    "",
    genericPrompt.backgroundStyle,
    "background",
    `${outputFolder}/openai-medium-${chapter}-${startingParagraph}.webp`,
    attempt,
  );

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
        finalPrompt = `${generalPrompt} ${prompt} ${characterName}`;
        break;
      case 2:
        finalPrompt = `${generalPrompt} ${prompt}`;
        break;
      default:
      case 3: {
        const sanitizedPrompt = await sanitizePromptForModeration(prompt);
        finalPrompt = `${generalPrompt} ${sanitizedPrompt}`;
        break;
      }
    }
  } else {
    finalPrompt = `${generalPrompt} Only scene-setting environment. ${prompt}`;
  }

  const input = {
    aspect_ratio: type === "avatar" ? "1:1" : "16:9",
    input_images: [],
    output_format: type === "background" ? "webp" : "png",
    output_quality: 80,
    prompt: finalPrompt,
    resolution: "1 MP",
    safety_tolerance: 5,
    seed: 43605,
  };

  let url: string;
  try {
    const output = await replicate.run("black-forest-labs/flux-2-pro", { input });

    // @ts-expect-error wrong types of replicate - flux-2-pro returns object with .url() method
    url = output.url();
  } catch (e) {
    console.error(`Failed to generate image after ${attempt} attempts: ${e}`);
    if (attempt < 3) {
      return await generateFluxImage(
        prompt,
        characterName,
        generalPrompt,
        type,
        filePath,
        attempt + 1,
      );
    } else {
      logger.error(
        `Failed to generate image after 3 attempts for prompt: ${characterName} ${prompt}`,
      );
      return undefined;
    }
  }

  logger.info(`Replicate returned URL: ${url}`);

  // Download the image and save it to the book output folder
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download image: ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // let filePath;
  // if (type === "avatar") {
  //   const originalFilePath = getPictureFileNameForName(characterName);
  //   filePath = `characters/${originalFilePath}`;
  // } else {
  //   filePath = `backgrounds/${fileName}`;
  // }
  // const filePath = `characters/${originalFilePath.replace(".png", ".webp")}`;

  if (returnBuffer) {
    return buffer;
  }
  if (filePath) {
    writeBookFile(filePath, buffer, FILE_TYPE.PERMANENT);
    logger.info(
      `Image saved: getFilePath(filePath): ${getFilePath(filePath, FILE_TYPE.PERMANENT)}`,
    );
    return filePath;
  }
  return undefined;
};

if (require.main === module) {
  generateFluxImage(
    "A beautiful woman with long brown hair and blue eyes",
    "test",
    "SinCity style",
    "avatar",
    "test.webp",
  ).then((image) => {
    console.log(`image: ${image}`);
  });
}
