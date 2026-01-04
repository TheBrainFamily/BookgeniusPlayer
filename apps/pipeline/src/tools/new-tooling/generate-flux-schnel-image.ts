import Replicate from "replicate";
import { writeBookFile } from "../../helpers/writeBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { getPictureFileNameForName } from "../../helpers/getPictureFileNameForName";
import { logger } from "../../logger";
import { getFilePath } from "../../helpers/filesHelpers";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

type PictureType = "avatar" | "background";
export const generateFluxImage = async (
  prompt: string,
  characterName: string,
  generalPrompt: string,
  type: PictureType,
  attempt = 1,
  fileName?: string,
): Promise<string | null> => {
  let finalPrompt;
  if (type === "avatar") {
    finalPrompt = `${generalPrompt} ${prompt} ${characterName}`;
  } else {
    finalPrompt = `${generalPrompt} No foreground characters or objects, only scene-setting environment. ${prompt}`;
  }
  const input = {
    prompt: finalPrompt,
    go_fast: true,
    megapixels: "1",
    num_outputs: 1,
    aspect_ratio: type === "avatar" ? "1:1" : "16:9",
    output_format: "png",
    output_quality: 80,
    num_inference_steps: 4,
    seed: 972314174,
  };

  let url: string;
  try {
    const output = await replicate.run("black-forest-labs/flux-schnell", { input });

    // @ts-expect-error wrong types of replicate
    url = output[0].toString();
  } catch (e) {
    console.error(`Failed to generate image after ${attempt} attempts: ${e}`);
    if (attempt < 3) {
      return await generateFluxImage(prompt, characterName, generalPrompt, type, attempt + 1, fileName);
    } else {
      logger.error("Failed to generate image after 3 attempts");
      return null;
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

  let filePath;
  if (type === "avatar") {
    const originalFilePath = getPictureFileNameForName(characterName);
    filePath = `characters/${originalFilePath.replace(".png", ".png")}`;
  } else {
    filePath = `backgrounds/${fileName}`;
  }
  // const filePath = `characters/${originalFilePath.replace(".png", ".webp")}`;

  writeBookFile(filePath, buffer, FILE_TYPE.PERMANENT);
  logger.info(`Image saved: getFilePath(filePath): ${getFilePath(filePath, FILE_TYPE.PERMANENT)}`);

  return filePath;
};

if (require.main === module) {
  generateFluxImage("A beautiful woman with long brown hair and blue eyes", "test", "SinCity style", "avatar").then(
    (image) => {
      console.log(`image: ${image}`);
    },
  );
}
