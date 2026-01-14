// To run this code you need to install the following dependencies:
// npm install @google/genai mime
// npm install -D @types/node

import "dotenv/config";
import { readBookFile } from "../helpers/readBookFile";
import { FILE_TYPE } from "../helpers/filesHelpers";
import { z } from "zod";
import { writeBookFile } from "../helpers/writeBookFile";
import { callClaude } from "../callClaude";

// Run this code like this:
// first you need to create music-prompts.md in folder of the book, so ,for example:
// books-data/othello/input/music-prompts.md
// copy it to for example books-data/macbeth/input/music-prompts.md
// cp books-data/othello/input/music-prompts.md books-data/macbeth/input/music-prompts.md
// and edit it.
// Then run
// tsx src/tools/create-music.ts books-data/macbeth/
// to verify if if the creations for two chapters make sense.
// then if yes, remove the return from line around 44 to process all.

async function main() {
  const summariesForAllChapters = JSON.parse(
    readBookFile("summaries-with-paragraphs.json", FILE_TYPE.TEMPORARY),
  ) as {
    chapterSummary: {
      contextSummary: string;
      chapterBulletPoints: { paragraphNumbers: number[]; paragraphsSummary: string }[];
      chapterNumber: number;
    };
  }[];

  const musicPrompts = readBookFile("music-prompts.md", FILE_TYPE.INPUT);
  const bookSettings = JSON.parse(readBookFile("bookSettings.json", FILE_TYPE.TEMPORARY)) as {
    numberOfChaptersToProcess: number;
    startFromChapter: number;
  };
  const chaptersToParse = Array.from(
    { length: bookSettings.numberOfChaptersToProcess },
    (_, i) => i,
  );
  console.log(`chapters to parse: ${chaptersToParse.join(", ")}`);
  const allResponses: { songTitle: string; songStyle: string }[] = [];
  await Promise.all(
    chaptersToParse.map(async (index) => {
      const chapterNumber = bookSettings.startFromChapter + index;
      console.log(`Chapter ${chapterNumber}`);
      // if (chapterNumber >= 2) {
      //   console.log(`Skipping chapter ${chapterNumber}, remove the return from line below to process all chapters`);
      //   return;
      // }

      const foundChapter = summariesForAllChapters.find((chapterObject) => {
        return chapterObject.chapterSummary.chapterNumber === chapterNumber;
      });
      if (!foundChapter) {
        console.log(`Chapter ${chapterNumber} not found`);
        return;
      }
      console.log(`Chapter ${chapterNumber} found,`);
      const chapterSummary = foundChapter.chapterSummary.contextSummary;
      const chapterData = foundChapter.chapterSummary.chapterBulletPoints;

      const prompt = `
    Use this as a guideline for preparing prompts for AI Music generator:

    
    I'm sending you the scenes for a chapter, there will be many scenes for a chapter, but suggest a song that should span them. We should have 2, max 3 songs for the chapter, depending on changes in it and turns and surprises.
    The song should be a background music, so it should be slow, flowy, and consistent.
      For each prompt, return the starting paragraph number. The first song should always start at paragraph 1. You dont have to specify the end paragraph number. The song will be played till the paragraph matching the next song.
      Do not mention any characters in the prompt, only describe the music. You can say things like "tension, jealousy, sadness, romance, seduction etc." that relate to the feeling of a song, but not "Sara is seduced by Ramzes".
      Every prompt should be self sufficient, do not reference other prompts. They will be used in separation by AI system that has no idea it is a part of series.
      Stay on the slower side. Do not change the style mid music, use different scene to change the music style and tempo if needed. Music should be backgroundy, flowy, stays consistent for the song. Unless the scene starts slowly but quickly turns into a heavy action.
      Dont switch the music too often, try not to have less than 20-30 paragraphs for a song, so there is time for the music to play. If there is only 30-40 paragraphs in a chapter, give a prompt for one song for the whole chapter.
      900 characters top. So try 600-800 characters for each prompt.

      The trick is, suno - the music generator, takes phrases between "," as the guiding prompts. So they have to be all separate. For example: "distant church bell chimes gaslight hiss vintage street ambiance" has to be:"distant church bell chimes, gaslight hiss, vintage street ambiance" etc. So make sure to add the comas. Do not write in full sentences. Write short phrases that define what characteristics the song should have. It would be better visualized by a table of characteristics, but suno wants a long string coma separated, so lets do that.

      Example prompts use them to guide the style, you can also guide yourself using their titles to match with the scenes, if a scene matches closely, you can use the prompts closely as well:
      ${musicPrompts}

      Context summary of the book:
      <context-summary>
      ${chapterSummary}
      </context-summary>
      Chapter data:
      <chapter-data>
      ${chapterData
        .map(
          (scene) =>
            `Paragraphs from ${Math.min(...scene.paragraphNumbers)} to ${Math.max(...scene.paragraphNumbers)}: ${
              scene.paragraphsSummary
            }`,
        )
        .join("\n")}
      </chapter-data>

      Return a json with the following structure:
      [
        {
          "startParagraph": 1,
          "prompt": "prompt for the first song"
        },
        {
          "startParagraph": 10,
          "prompt": "prompt for the second song"
        }
      ]
      `;

      const schema = z.array(z.object({ startParagraph: z.number(), prompt: z.string() }));
      const response = await callClaude(prompt, schema, 5, 1024 * 3, true, true);
      console.log(`Chapter ${chapterNumber}: ${JSON.stringify(response, null, 2)}`);
      response?.forEach((song) => {
        allResponses.push({
          songTitle: `${chapterNumber}-${song.startParagraph}`,
          songStyle: song.prompt,
        });
      });
    }),
  );
  const allResponsesSorted = allResponses.sort((a, b) => {
    const [aChapter, aParagraph] = a.songTitle.split("-").map(Number);
    const [bChapter, bParagraph] = b.songTitle.split("-").map(Number);

    if (aChapter !== bChapter) {
      return aChapter - bChapter;
    }
    return aParagraph - bParagraph;
  });
  writeBookFile(
    "music-prompts.json",
    JSON.stringify(allResponsesSorted, null, 2),
    FILE_TYPE.TEMPORARY,
  );
}

main();
