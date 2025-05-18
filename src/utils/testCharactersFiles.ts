import fs from "fs";
import path from "path";
import { CURRENT_BOOK } from "@/consts";
import { getListeningMediaFilePathForName, getTalkingMediaFilePathForName } from "./getFilePathsForName";
import { getBookData } from "@/booksData/getBookData";

type InfoPerChapter = { chapter: number; summary: string; label?: string; paragraphsWhereSpotted: number[]; paragraphsWhereTalking: number[] };

export type CharacterData = { slug: string; characterName: string; bookSlug: string; infoPerChapter: InfoPerChapter[]; imageUrl: string };

console.log(`\n\n\n\n\n\n\n\n\n`);
const doIt = async () => {
  const bookData = await getBookData();
  bookData.charactersData.forEach((character: CharacterData) => {
    const doesCharacterTalk = character.infoPerChapter.find((info) => info.paragraphsWhereTalking.length > 0);
    const isCharacterListening = character.infoPerChapter.find((info) => info.paragraphsWhereSpotted.length > 0);

    // const listeningFile = getListeningMediaFilePathForName(character.characterName, CURRENT_BOOK);
    // const talkingFile = getTalkingMediaFilePathForName(character.characterName, CURRENT_BOOK);
    const listeningFile = getListeningMediaFilePathForName(character.slug, CURRENT_BOOK);
    const talkingFile = getTalkingMediaFilePathForName(character.slug, CURRENT_BOOK);
    const forcedKnownListeningFile = getListeningMediaFilePathForName(character.slug, CURRENT_BOOK, true);
    const forcedKnownTalkingFile = getTalkingMediaFilePathForName(character.slug, CURRENT_BOOK, true);
    // Check if the files exist in the public_books directory

    const publicBooksDir = path.resolve(__dirname, `../../public_books/${CURRENT_BOOK}`);

    // Extract just the filename from the paths
    const listeningFileName = listeningFile.split("/").pop();
    const talkingFileName = talkingFile.split("/").pop();

    let talkingMissing = false;
    let listeningMissing = false;

    const listeningFilePath = path.join(publicBooksDir, listeningFileName);
    const listeningFileExists = fs.existsSync(listeningFilePath);

    const forcedKnownListeningFilePath = path.join(publicBooksDir, forcedKnownListeningFile);
    const forcedKnownListeningFileExists = fs.existsSync(forcedKnownListeningFilePath);
    if (!listeningFileExists && isCharacterListening && !forcedKnownListeningFileExists) {
      listeningMissing = true;
    }

    const talkingFilePath = path.join(publicBooksDir, talkingFileName);
    const talkingFileExists = fs.existsSync(talkingFilePath);

    const forcedKnownTalkingFilePath = path.join(publicBooksDir, forcedKnownTalkingFile);
    const forcedKnownTalkingFileExists = fs.existsSync(forcedKnownTalkingFilePath);
    if (!talkingFileExists && doesCharacterTalk && !forcedKnownTalkingFileExists) {
      talkingMissing = true;
    }

    if (listeningMissing || talkingMissing) {
      console.log(`\n\n${character.characterName} : ${character.slug} - Talking: ${doesCharacterTalk ? "YES" : "NO"} - Listening: ${isCharacterListening ? "YES" : "NO"}`);
    }
    if (listeningMissing) {
      console.log(`Listening missing: ${listeningFileName}`);
    }
    if (talkingMissing) {
      console.log(`Talking missing: ${talkingFileName}`);
    }
  });
};

doIt();
