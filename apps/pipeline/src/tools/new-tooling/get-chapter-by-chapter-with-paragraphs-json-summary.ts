import { callClaude } from "../../callClaude";
import { z } from "zod";
import "dotenv/config";
import { getParagraphsFromChapter } from "../createParagraphsWithPageNumbers";
import { getBookSettings } from "../../helpers/getBookSettings";
import { readBookFile } from "../../helpers/readBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { writeBookFile } from "../../helpers/writeBookFile";
import { callSlowGeminiWithThinkingAndSchemaAndParsed } from "../../callFastGemini";
import { callGrokAzureWithSchema } from "src/callGrokAzure";
import { buildParagraphsForSummary } from "./summaryParagraphs";

// Define the schema for reference cards response
const ScenesSummariesPerChapterSchema = z.object({
  chapterSummary: z.object({
    contextSummary: z.string(),
    chapterBulletPoints: z.array(
      z.object({
        paragraphsSummary: z.string(),
        paragraphNumbers: z.array(z.number()),
        mainParagraphNumber: z.number(),
      }),
    ),
  }),
});

// Define the TypeScript type based on the schema
type ScenesSummariesPerChapterBase = z.infer<typeof ScenesSummariesPerChapterSchema>;

export type ScenesSummariesPerChapter = ScenesSummariesPerChapterBase & {
  chapterSummary: ScenesSummariesPerChapterBase["chapterSummary"] & { chapterNumber: number };
};

export interface GenerateSingleChapterSummaryOptions {
  chapterNum: number;
  paragraphs: { text: string; dataIndex: number }[];
  rollingSummary: string;
  bookLanguage?: string;
}

export async function generateSingleChapterSummary(
  options: GenerateSingleChapterSummaryOptions,
): Promise<ScenesSummariesPerChapter> {
  const { chapterNum, paragraphs, rollingSummary, bookLanguage = "English" } = options;

  const paragraphsForPage = buildParagraphsForSummary(paragraphs);

  const prompt = `
## Fiction Book Chapter Summary

### Instructions:

You are summarizing a fiction book, chapter by chapter. When summarizing each chapter, you must explicitly refer to characters by name. 

Your summary must be concise yet detailed, always explicitly mentioning the names of characters whenever describing events, actions, or decisions. Each chapter summary should clearly indicate:

Plot Events, describe the main events occurring in the chapter, explicitly mentioning involved characters by name. Clearly indicate specific actions taken or important decisions made by each named character.

Always refer explicitly to the characters by their full names (or commonly used names as found in the text) to ensure summaries are searchable by character references. Maintain consistent structure for each chapter.

For each bullet point, which is main plot event, you should provide a list of paragraph numbers that are relevant to that bullet point.

For each bullet point, you should also provide the main paragraph number that is relevant to that bullet point. Basically, we will be doing embedding search over the bulletPoints, and then show the user the main paragraph number that is relevant to that bullet point, so they can jump to the relevant paragraph easily.

Be guided by the already provided summary as it was generated with whole book context, provide bullet points and paragraph matching based on them and the provided paragraphs.

### Format of the summaries.

Short, concise sentences. More like a telegram defining what happened than a nicely written abridged rewrite. Pack as much information in as few words as possible. Make sure the bullet points are self-contained. They won't be read in order, or in context of the previous bullet points.

### Format of the output

The output should be a JSON object with the following structure:

{
  "chapterSummary": {
    "contextSummary": "string",
    "chapterBulletPoints": [
      {
        "paragraphsSummary": "string" // summary of the bullet point
        "paragraphNumbers": [3, 4, 6], // array of paragraph numbers that are relevant to  this bullet point
        "mainParagraphNumber": 4 // the main paragraph number that is relevant to this bullet point
      }
    ]
  }
}


## Chapter
<chapterText>
${paragraphsForPage}
</chapterText>

## Chapter summarized:
<currentChapterSummary>
${rollingSummary}
</currentChapterSummary>

Provide your summary clearly organized according to the structure above, explicitly mentioning all involved characters by their names.
  `;

  console.log("requesting summary for chapter", chapterNum);

  let summary: ScenesSummariesPerChapter;

  try {
    summary = (await callSlowGeminiWithThinkingAndSchemaAndParsed(
      bookLanguage === "Polish"
        ? `${prompt}\n Książka jest po Polsku, więc napisz podsumowanie również po Polsku.`
        : prompt,
      ScenesSummariesPerChapterSchema,
    )) as ScenesSummariesPerChapter;
  } catch (e) {
    console.error(`Error for chapter ${chapterNum}`, e);
    summary = (await callClaude(
      bookLanguage === "Polish"
        ? `${prompt}\n Książka jest po Polsku, więc napisz podsumowanie również po Polsku.`
        : prompt,
      ScenesSummariesPerChapterSchema,
      2,
    )) as ScenesSummariesPerChapter;
  }

  summary.chapterSummary.chapterNumber = chapterNum;
  console.log(`\n\nChapter ${chapterNum} summary: done`);

  return summary;
}

export const turnChapterSummariesIntoBulletPointsMappedToParagraphs = async () => {
  const bookSettings = getBookSettings();
  const chapterFrom = bookSettings.startFromChapter;
  const chapterTo = bookSettings.startFromChapter + bookSettings.numberOfChaptersToProcess - 1;

  const jsonSummaries: ScenesSummariesPerChapter[] = [];
  const chaptersToParse = Array.from(
    { length: chapterTo - chapterFrom + 1 },
    (_, i) => i + chapterFrom,
  );
  await Promise.all(
    chaptersToParse.map(async (chapterNum) => {
      const previousSummaries: string[] = [];
      for (
        let summaryChapterNum = chapterFrom;
        summaryChapterNum <= chapterNum;
        summaryChapterNum++
      ) {
        try {
          const previousSummary = readBookFile(
            `summaries-chapter-by-chapter-${summaryChapterNum}.txt`,
            FILE_TYPE.TEMPORARY,
          );
          previousSummaries.push(previousSummary);
        } catch {
          if (chapterNum === chapterFrom) {
            console.log("No previous summary for chapter 1");
            process.exit(1);
          } else {
            console.log(
              `No previous summary for chapter ${summaryChapterNum}, possibly end of book`,
            );
            return;
          }
        }
      }

      const paragraphsFromChapter = getParagraphsFromChapter(chapterNum, true, true);

      const paragraphsForPage = buildParagraphsForSummary(paragraphsFromChapter);

      const prompt = `
## Fiction Book Chapter Summary

### Instructions:

You are summarizing a fiction book, chapter by chapter. When summarizing each chapter, you must explicitly refer to characters by name. 

Your summary must be concise yet detailed, always explicitly mentioning the names of characters whenever describing events, actions, or decisions. Each chapter summary should clearly indicate:

Plot Events, describe the main events occurring in the chapter, explicitly mentioning involved characters by name. Clearly indicate specific actions taken or important decisions made by each named character.

Always refer explicitly to the characters by their full names (or commonly used names as found in the text) to ensure summaries are searchable by character references. Maintain consistent structure for each chapter.

For each bullet point, which is main plot event, you should provide a list of paragraph numbers that are relevant to that bullet point.

For each bullet point, you should also provide the main paragraph number that is relevant to that bullet point. Basically, we will be doing embedding search over the bulletPoints, and then show the user the main paragraph number that is relevant to that bullet point, so they can jump to the relevant paragraph easily.

Be guided by the already provided summary as it was generated with whole book context, provide bullet points and paragraph matching based on them and the provided paragraphs.

### Format of the summaries.

Short, concise sentences. More like a telegram defining what happened than a nicely written abridged rewrite. Pack as much information in as few words as possible. Make sure the bullet points are self-contained. They won't be read in order, or in context of the previous bullet points.

### Format of the output

The output should be a JSON object with the following structure:

{
  "chapterSummary": {
    "contextSummary": "string",
    "chapterBulletPoints": [
      {
        "paragraphsSummary": "string" // summary of the bullet point
        "paragraphNumbers": [3, 4, 6], // array of paragraph numbers that are relevant to  this bullet point
        "mainParagraphNumber": 4 // the main paragraph number that is relevant to this bullet point
      }
    ]
  }
}


## Chapter
<chapterText>
${paragraphsForPage}
</chapterText>

## Chapter summarized:
<currentChapterSummary>
${previousSummaries[previousSummaries.length - 1]}
</currentChapterSummary>

Provide your summary clearly organized according to the structure above, explicitly mentioning all involved characters by their names.
  `;

      console.log("requesting summary for chapter", chapterNum);
      // Use `prompt` with your LLM here and store the output as `summary`
      let summary: ScenesSummariesPerChapter;

      try {
        summary = (await callGrokAzureWithSchema(
          `${prompt}\n Reply in the language of the book. It's usually Polish or English. Your instructions are in English so you often reply in English, buts its VERY important to reply in Polish when the book is in Polish, and same goes for other languages..`,
          ScenesSummariesPerChapterSchema,
        )) as ScenesSummariesPerChapter;
      } catch (e) {
        console.error(`Error for chapter ${chapterNum}`, e);
        try {
          summary = (await callSlowGeminiWithThinkingAndSchemaAndParsed(
            `${prompt}\n Reply in the language of the book. It's usually Polish or English. Your instructions are in English so you often reply in English, buts its VERY important to reply in Polish when the book is in Polish, and same goes for other languages.`,
            ScenesSummariesPerChapterSchema,
          )) as ScenesSummariesPerChapter;
        } catch (e) {
          console.error(`Error for chapter ${chapterNum}`, e);
          return;
        }
      }
      console.log(`\n\nChapter ${chapterNum} summary: done`);
      // summary.chapterSummary.chapterBulletPoints.forEach((bulletPoint) => {
      //   console.log(
      //     `\n\nBullet Point: ${bulletPoint.paragraphsSummary}, text: ${
      //       paragraphsFromChapter.find((paragraph) => paragraph.dataIndex === bulletPoint.mainParagraphNumber)?.text
      //     }`,
      //   );
      // });
      summary.chapterSummary.chapterNumber = chapterNum;
      // Update previousSummaries
      // const currentSummary = `### Chapter ${chapterNum} "\n #### Context Summary: ${summary.chapterSummary.contextSummary}\n #### Bullet Points: ${summary.chapterSummary.chapterBulletPoints.map((bulletPoint) => bulletPoint.paragraphsSummary).join("\n")}`;
      // previousSummaries += `\n\n${currentSummary}`;
      jsonSummaries.push(summary);
      writeBookFile(`prompt-summaries-with-paragraphs-${chapterNum}.txt`, prompt);
      writeBookFile(
        `summaries-with-paragraphs-${chapterNum}.json`,
        `${JSON.stringify(summary, null, 2)}`,
      );
    }),
  );

  writeBookFile(
    "summaries-with-paragraphs.json",
    JSON.stringify(
      jsonSummaries.sort((a, b) => a.chapterSummary.chapterNumber - b.chapterSummary.chapterNumber),
      null,
      2,
    ),
  );
};

if (require.main === module) {
  turnChapterSummariesIntoBulletPointsMappedToParagraphs();
}
