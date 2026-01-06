import fs from "fs";
import { DOMParser } from "@xmldom/xmldom";
import { callGeminiWrapper } from "../../callClaude";
import { getParagraphsFromChapter } from "../createParagraphsWithPageNumbers";
import { logger } from "../../logger";
import { type NewReferenceCardsResponse } from "../../types";
import { writeBookFile } from "../../helpers/writeBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { readBookFile } from "../../helpers/readBookFile";
import { generateCharacterMetadata } from "../create-book-metadata";
import { getCurrentBook } from "../../helpers/getCurrentBook";
import { pullTogetherChapters } from "../pullTogetherChapters";
import { generateCharactersMaster } from "../postprocessing-helpers/generate-characters-master";
import { franc } from "franc";
import { getLanguageName } from "../getLanguageName";
import { getBookForm } from "../getBookForm";

type ChapterBulletPoint = {
  mainParagraphNumber: number;
  paragraphNumbers: number[];
  paragraphsSummary: string;
};

type ChapterSummary = { chapterBulletPoints: ChapterBulletPoint[] };

type ChapterData = { chapterSummary: ChapterSummary };

// The type representing the structure you provided

export const generateIntroSummary = async (summaries: NewReferenceCardsResponse) => {
  const currentBook = getCurrentBook();
  console.log("currentBook", currentBook);
  const bookSlug = currentBook.match(/[^/]*$/)?.[0];

  if (!bookSlug) {
    logger.error(
      `No book slug found for ${currentBook}. Please provide the argument as 'books-data/BOOK_TITLE'`,
    );
    process.exit(1);
  }

  const { xmlDoc, bookString } = generateBookFiles(currentBook);

  const charactersMetadata = generateCharacterMetadata(
    xmlDoc as unknown as XMLDocument,
    bookString,
    "play",
    bookSlug,
  );
  writeBookFile(
    `characters-metadata.json`,
    JSON.stringify(charactersMetadata, null, 2),
    FILE_TYPE.PERMANENT,
  );

  // await connectDB();
  const introSummaries: { characterName: string; summary: string }[] = [];
  await Promise.all(
    charactersMetadata.map(async (characterMetadata) => {
      const chapterWhenFirstSpotted = characterMetadata.infoPerChapter[0].chapter;
      const secondSummary = summaries.characters.find(
        (character) => character.name === characterMetadata.characterName,
      )?.referenceCard;
      if (!secondSummary) {
        logger.error(`No second summary found for ${characterMetadata.characterName}`);
        return;
      }
      const paragraphs = getParagraphsFromChapter(chapterWhenFirstSpotted);

      const firstSpottedParagraphNumber =
        characterMetadata.infoPerChapter[0].paragraphsWhereSpotted[0];
      let firstActionData: ChapterData | null;
      try {
        firstActionData = JSON.parse(
          // fs.readFileSync(`summaries-with-paragraphs-${chapterWhenFirstSpotted}.json`, "utf8"),
          readBookFile(
            `summaries-with-paragraphs-${chapterWhenFirstSpotted}.json`,
            FILE_TYPE.TEMPORARY,
          ),
        ) as ChapterData;
      } catch (error) {
        logger.error(
          `Error parsing first action data for ${characterMetadata.characterName} chapter ${chapterWhenFirstSpotted}: ${error}`,
        );
        firstActionData = null;
      }
      let indexOfSecondSceneWithCharacter = null;
      let indexOfFirstSceneWithCharacter = null;
      const additionalContext = [];

      if (firstActionData) {
        indexOfFirstSceneWithCharacter =
          firstActionData.chapterSummary.chapterBulletPoints.findIndex((bulletPoint) =>
            bulletPoint.paragraphNumbers.includes(firstSpottedParagraphNumber),
          );

        if (indexOfFirstSceneWithCharacter === -1) {
          // {"msg":"No main bullet point related to first spotted paragraph for Ramzes XII chapter 1, paragraph 1"}
          logger.error(
            `No main bullet point related to first spotted paragraph for ${characterMetadata.characterName} chapter ${chapterWhenFirstSpotted}, paragraph ${firstSpottedParagraphNumber}`,
          );

          console.log(JSON.stringify(firstActionData.chapterSummary.chapterBulletPoints, null, 2));
          introSummaries.push({
            characterName: characterMetadata.characterName,
            summary: secondSummary,
          });
          return;
        }

        if (
          firstActionData.chapterSummary.chapterBulletPoints[indexOfFirstSceneWithCharacter]
            .mainParagraphNumber < firstSpottedParagraphNumber
        ) {
          if (
            firstActionData.chapterSummary.chapterBulletPoints.length >
            indexOfFirstSceneWithCharacter + 1
          ) {
            const nextBulletPoint =
              firstActionData.chapterSummary.chapterBulletPoints[
                indexOfFirstSceneWithCharacter + 1
              ];
            if (
              nextBulletPoint.paragraphNumbers.some((paragraphNumber) =>
                characterMetadata.infoPerChapter[0].paragraphsWhereSpotted.includes(
                  paragraphNumber,
                ),
              ) ||
              nextBulletPoint.paragraphNumbers.some((paragraphNumber) =>
                characterMetadata.infoPerChapter[0].paragraphsWhereTalking.includes(
                  paragraphNumber,
                ),
              )
            ) {
              indexOfSecondSceneWithCharacter = indexOfFirstSceneWithCharacter + 1;
            }
          }
        }
        if (indexOfFirstSceneWithCharacter) {
          additionalContext.push(
            `<firstSceneSummary>${firstActionData.chapterSummary.chapterBulletPoints[indexOfFirstSceneWithCharacter].paragraphsSummary}</firstSceneSummary>`,
          );
        }

        if (indexOfSecondSceneWithCharacter) {
          additionalContext.push(
            `<secondSceneSummary>${firstActionData.chapterSummary.chapterBulletPoints[indexOfSecondSceneWithCharacter].paragraphsSummary}</secondSceneSummary>`,
          );
        }
      }

      const allTextTillFirstSpottedParagraph = paragraphs
        .filter((paragraph) => paragraph.dataIndex <= firstSpottedParagraphNumber + 1)
        .map((paragraph) => paragraph.text)
        .join("\n");

      const prompt = `
          You are generating a brief introductory summary (1-2 very short bullet point style sentences) for a character "${characterMetadata.characterName}" who just appeared in the story, without spoiling future plot details.
          To avoid spoilers, base it on the current page text and book summary so far included in the context.

          Use the overallSummary to help you find the person in the passed text and context (for example it could say it is a family of another character, and that character is mentioning them by their relation instead of name), but if possible, do not use it to generate the summary, as it might have spoilers in it.

          <overallSummary>${secondSummary}</overallSummary>
        <context>${allTextTillFirstSpottedParagraph}</context>
        ${additionalContext.join("\n")}

        Important notes:
        — Generated summary should be in the language that the book is written in. If the book is in Polish, the summary should be in Polish. If the book is in English, the summary should be in English.

        Instructions:
        - Explain concisely who this character is within the context of the narrative up to now.
        - Highlight their immediate relevance or significance (e.g., relationship to other characters, occupation, or initial role in the story).
        - Do NOT include the character's name in the bullet points (their name will appear separately).
        - Answer with one-two sentences in seperate lines, no bullet point characters, no other text, no explanation of what you are doing
        - Make it super concise, do not say full sentences, things like "Mantel jest urzędnikiem, który odpowiada za skarbiec", or "Jest urzędnikiem, który..", just say "Urzędnik odpowiadający za skarbiec"
        - Do NOT include any details about the character's relationship to other characters if it is not mentioned in the text. For example: "King of the Fairies. Feuding with the Queen over a changeling boy." it sells too much information that looks like a spoiler. It's better to say this instead "King of the Fairies, commanding and willful, consort to Titania."`;

      let introSummary = (await callGeminiWrapper(prompt)) as string;
      logger.info(`Intro summary for ${characterMetadata.characterName}: ${introSummary}`);
      if (!introSummary || introSummary.trim().length === 0) {
        logger.warning(
          `Intro summary for ${characterMetadata.characterName} is empty, retrying...`,
        );
        introSummary = (await callGeminiWrapper(prompt)) as string;
        logger.info(`Intro summary for ${characterMetadata.characterName}: ${introSummary}`);
        if (!introSummary || introSummary.trim().length === 0) {
          logger.error(`Intro summary for ${characterMetadata.characterName} is empty`);
          process.exit(1);
        }
      }

      characterMetadata.infoPerChapter[0].summary = introSummary;
      introSummaries.push({
        characterName: characterMetadata.characterName,
        summary: introSummary,
      });
      // await characterMetadata.save();
      // writeBookFile(`intro-summary-${characterMetadata.characterName}.txt`, introSummary, FILE_TYPE.PERMANENT);
    }),
  );

  const result = introSummaries.map((introSummary) => ({
    name: introSummary.characterName,
    referenceCard: introSummary.summary.replace(/\n/g, " "),
  }));

  writeBookFile(
    `intro-summary-all.json`,
    JSON.stringify({ characters: result }, null, 2),
    FILE_TYPE.PERMANENT,
  );
  generateCharactersMaster("intro-summary-all.json");
};

const getOrGenerateFile = (
  filePath: string,
  generatorFn: () => void,
  fileNameForLog: string,
  attempt = 1,
): string | null => {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  } else if (attempt <= 3) {
    logger.info(`Attempt ${attempt}: ${fileNameForLog} not found, running generator...`);
    generatorFn();
    return getOrGenerateFile(filePath, generatorFn, fileNameForLog, attempt + 1);
  } else {
    logger.error(`Failed to find or generate ${fileNameForLog} after ${attempt - 1} attempts.`);
    return null;
  }
};

const getBookChapters = (currentBook: string): string | null => {
  const allChaptersPath = `./${currentBook}/output/all-chapters.xml`;
  return getOrGenerateFile(allChaptersPath, pullTogetherChapters, "all-chapters.xml");
};

const getCharactersMaster = (currentBook: string): string | null => {
  const charactersMasterPath = `./${currentBook}/output/characters-master-summaries.xml`;
  return getOrGenerateFile(
    charactersMasterPath,
    generateCharactersMaster,
    "characters-master-summaries.xml",
  );
};

const generateBookFiles = (currentBook: string) => {
  const parser = new DOMParser();

  const bookChapters = getBookChapters(currentBook);
  const charactersMaster = getCharactersMaster(currentBook);

  if (!bookChapters || !charactersMaster) {
    process.exit(1);
  }

  const bookLang = getLanguageName(franc(bookChapters));

  const bookString = `<?xml version="1.0" encoding="UTF-8"?>\n<ebook id="demo-single-source" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xi="http://www.w3.org/2001/XInclude" xsi:noNamespaceSchemaLocation="ebook.xsd">
  ${charactersMaster}
  
  <BookMetadata>
    <Language>${bookLang}</Language>
    <Form>${getBookForm()}</Form>
  </BookMetadata>
  
  ${bookChapters}
  </ebook>
  `;

  const xmlDoc = parser.parseFromString(bookString, "text/xml");

  return { xmlDoc, bookString };
};
