import { pharaonCharactersData } from "./pharaon-apr-10.selfsufficientcharactermetadatas";

const firstSummaryPerPerson = pharaonCharactersData.map((character) => {
  return { characterName: character.characterName, summary: character.infoPerChapter[0].summary };
});

console.log(firstSummaryPerPerson);
