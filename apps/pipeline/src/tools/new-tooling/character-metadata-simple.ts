import fs from "fs";
import { logger } from "../../logger";
import { getReferenceCardsForWholeBook } from "./get-reference-cards-for-whole-book";
import { type NewReferenceCardsResponse } from "../../types";
import { checkIfBookDataExists } from "../../shared-books-data/getBooksData";
import { writeBookFile } from "../../helpers/writeBookFile";
import { FILE_TYPE, getFilePath } from "../../helpers/filesHelpers";
import { readBookFile } from "../../helpers/readBookFile";
import { turnChapterSummariesIntoBulletPointsMappedToParagraphs } from "./get-chapter-by-chapter-with-paragraphs-json-summary";
import { createBookSettings } from "../../helpers/createBookSettings";
import "dotenv/config";
import { identifyCharactersAndRewriteParagraphs } from "../identifyEntityAndRewriteParagraphs";
import { generatePicturesForEntities } from "./generate-pictures-for-entities";
import { generateBackgrounds } from "./generate-prompts-for-backgrounds";

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

const doIt = async () => {
  // await connectDB();
  // generate the characters based on the long prompt, whole book
  // logger.info("Generating reference cards for the whole book");

  let referenceCards: NewReferenceCardsResponse;

  console.log("check book data exists");

  checkIfBookDataExists();
  console.log("create book settings");
  createBookSettings();

  const singleSummaryPerPersonFileName = "single-summary-per-person.json";
  const singleSummaryPerPersonFilePath = getFilePath(
    singleSummaryPerPersonFileName,
    FILE_TYPE.PERMANENT,
  );

  if (fs.existsSync(singleSummaryPerPersonFilePath)) {
    referenceCards = JSON.parse(
      readBookFile(singleSummaryPerPersonFileName, FILE_TYPE.PERMANENT),
    ) as NewReferenceCardsResponse;
  } else {
    referenceCards = await getReferenceCardsForWholeBook(); // Generacja opisu wszystkich osob w ksiazce, z sugestia zeby nie bylo spoilerow. Ale i tak daje wiecej informacji niz te ktore by byly jak sie spotykasz z osoba po raz pierwszy.
    if (referenceCards.characters.length === 0) {
      logger.error("character-metadata-simple.ts -> No characters found.");
      process.exit(1);
    } else {
      writeBookFile(
        singleSummaryPerPersonFileName,
        JSON.stringify(referenceCards, null, 2),
        FILE_TYPE.PERMANENT,
      );
    }
  }

  await identifyCharactersAndRewriteParagraphs(referenceCards); // return the xml with characters injected
  await generateBackgrounds();
  await generatePicturesForEntities(referenceCards); //TODO see background todos
  await turnChapterSummariesIntoBulletPointsMappedToParagraphs(); // Generujemy podsumowania rozdzialow mapowane do akapitow na podstawie zrewritowanych XML-i.
};

doIt().then(() => {
  logger.info("Done");
  process.exit(0);
});
