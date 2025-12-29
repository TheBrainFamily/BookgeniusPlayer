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

export const generateBackgrounds = async () => {
  const bookSettings = getBookSettings();
  const chapters = getChaptersUpTo(
    bookSettings.startFromChapter || 1,
    bookSettings.startFromChapter + bookSettings.numberOfChaptersToProcess - 1,
  );

  const genericPrompt = JSON.parse(readBookFile("graphicalStyle.json", FILE_TYPE.TEMPORARY)) as GraphicalStyle;
  // };

  let cleanedPrompts: { chapter: number; sceneDescription: string; startingParagraph: number }[] = [];

  let initialPrompts: { chapter: number; response: { sceneDescription: string; startingParagraph: number }[] }[] = [];
  try {
    initialPrompts = JSON.parse(readBookFile("initial-prompts.json", FILE_TYPE.TEMPORARY));
  } catch {
    console.log("No initial prompts found, generating new ones");
  }

  if (initialPrompts.length === 0) {
    initialPrompts = await Promise.all(
      chapters.map(async (chapter) => {
        // if (FREE_RUN) {
        const prompt = `Create a visual description of the book chapter provided below.
      This will be used as a prompt for an artist to draw a picture for a background for a chapter of a book during ${genericPrompt.periodStyle}, so make sure it's time appropriate.
      Do not include any plot details, any information about people in the scene, nothing about whats happening.
      Do not include any characters in the scene.
      Do not make it overly detailed. Make it generic, backgroundy, paintely, possibly abstract, atmospheric.
      Describe only ONE scene, if the chapter has multiple scenes, describe the first one.
      Reply with a 2-3 sentences per scene. 
      Chapter Text: <chapter>${chapter.content}</chapter>

      ## Return format:
      {
        "sceneDescription": "string",
      }`;

        const schema = z.object({ sceneDescription: z.string() });
        const response = await callSonnet45([prompt], schema);
        console.log(`${chapter.number} - ${JSON.stringify(response)}`);
        return {
          chapter: chapter.number,
          response: [{ sceneDescription: response.sceneDescription, startingParagraph: 0 }],
        };
        //   } else {
        //     const paragraphsFromChapter: { text: string; dataIndex: number }[] = getParagraphsFromChapter(
        //       chapter.number,
        //       true,
        //       true,
        //     );

        //     const paragraphsForPage = paragraphsFromChapter
        //       .map((paragraph) => `<p id="${paragraph.dataIndex}">${paragraph.text.trim().replace(/"/g, "'")}</p>`)
        //       .join("\n");
        //     const prompt = `Create a visual description of the book scene described below.
        // This will be used as a prompt for an artist to draw a picture for a background for a chapter of a book during ${genericPrompt.periodStyle}, so make sure it's time appropriate.
        // Do not include any plot details, any information about people in the scene, nothing about whats happening.
        // Do not include any characters in the scene.
        // If the scene is outdoors, make it from a bird eye view, if indoors, position the camera far to allow for zoom in.
        // Do not make it overly detailed.
        // The prompts will be considered in isolation, so never mention previous or other scenes you are defining.
        // Reply with one paragraph per scene. There can be just one scene in the chapter, thats fine. But if the scene changes to a completely different place (or day turns into night or vice versa), you should provide a new paragraph. Two paragraph images per scene MAX.
        // Chapter Text: <chapter>${paragraphsForPage}</chapter>

        // ## Return format:
        // [{
        //   "sceneDescription": "string",
        //   "startingParagraph": 1,
        // }]`;
        //     // const models = [callGeminiWrapper, callClaude];

        //     // const randomModel = models[Math.floor(Math.random() * models.length)];
        //     // const response = await randomModel(prompt);
        //     const schema = z.object({
        //       response: z.array(z.object({ sceneDescription: z.string(), startingParagraph: z.number() })).max(2),
        //     });
        //     const response = await callGeminiWrapper(prompt, schema, 10);
        //     console.log(`${chapter.number} - ${JSON.stringify(response)}`);
        //     return { chapter: chapter.number, response: response.response };
        //   }
      }),
    );
  }
  writeBookFile("initial-prompts.json", JSON.stringify(initialPrompts, null, 2), FILE_TYPE.TEMPORARY);

  // Flatten all scenes from all chapters into a single array of { chapter, sceneDescription, startingParagraph }
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
        const fileName = `flux-schnell-${prompt.chapter}-${prompt.startingParagraph}.png`;
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
        const imageOpenAi = await generateImageWithOpenAI(
          prompt.sceneDescription,
          prompt.chapter,
          prompt.startingParagraph,
          1,
          "medium",
          "1536x1024",
          genericPrompt,
        );
        console.log(imageOpenAi);
      }),
    );
  }
};

if (require.main === module) {
  generateBackgrounds();
}
