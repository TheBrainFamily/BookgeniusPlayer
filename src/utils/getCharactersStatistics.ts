import { getBookData } from "@/booksData/getBookData";

getBookData().then((bookData) => {
  const allCharactersStats: { characterName: string; spottedIn: number; talkingIn: number; inChapters: number }[] = [];
  bookData.charactersData.forEach((character) => {
    const { characterName } = character;
    const characterStats = { characterName, spottedIn: 0, talkingIn: 0, inChapters: 0 };

    character.infoPerChapter.forEach((chapter) => {
      if (chapter.chapter) {
        characterStats.inChapters++;
      }

      characterStats.spottedIn += chapter.paragraphsWhereSpotted.length;
      characterStats.talkingIn += chapter.paragraphsWhereTalking.length;
    });

    allCharactersStats.push(characterStats);
  });

  console.log(
    allCharactersStats
      .sort((a, b) => b.inChapters - a.inChapters)
      .map((c) => `${c.characterName} - In number of chapters: ${c.inChapters} - Paragraphs spotted: ${c.spottedIn} - Paragraphs talking: ${c.talkingIn}`),
  );
});
