import fs from "fs";
import path from "path";
import { callGeminiWrapper } from "../../callClaude";
import { NewReferenceCardsResponse } from "../../types";
import { NewReferenceCardsResponseSchema } from "../../schemes";
import { getChaptersUpTo } from "../../helpers/getChaptersUpTo";
import { getBookSettings } from "../../helpers/getBookSettings";

export const getReferenceCardsForWholeBook = async (): Promise<NewReferenceCardsResponse> => {
  const booksSettings = getBookSettings();
  const filteredChapters = getChaptersUpTo(
    booksSettings.startFromChapter,
    booksSettings.startFromChapter + booksSettings.numberOfChaptersToProcess,
  );

  // Log the filtered chapters count
  console.log(`Filtered ${filteredChapters.length} chapters`);
  // You can now use filteredChapters instead of the raw chapters string
  // For example, converting back to XML format if needed:
  const filteredXml = `<chapters>
${filteredChapters
  .map(
    (chapter) =>
      `<chapter number="${chapter.number}"><title>${chapter.title}</title><content>${chapter.content}</content></chapter>`,
  )
  .join("\n")}
</chapters>`;

  // TODO: add separation between books files and AI data

  // const knownCharacters: { name: string; summary: string }[] = faraonKnownCharactersTom2;
  const knownCharacters: { name: string; summary: string }[] = [];

  const knownCharactersMapped = knownCharacters
    .map((character) => `<character name="${character.name}" summary="${character.summary}" />`)
    .join("\n");

  const prompt = fs.readFileSync(path.join(__dirname, "./single-summary-per-person.md"), "utf8"); // this is not a book related file, AI prompts
  const knownCharactersPrompt =
    knownCharactersMapped.length > 0
      ? `## Known Characters
### Notes

- Be consistent with character names.
- Use the known character names and summaries for the already known characters from the previous book in the series.

### List of characters from the previous book in the series

${knownCharactersMapped}\n\n`
      : "";
  const combinedPrompt = `${prompt}${knownCharactersPrompt}\n\n## Book Text \n\n${filteredXml}`;

  console.log("combinedPrompt length:", combinedPrompt.length);

  return callGeminiWrapper(combinedPrompt, NewReferenceCardsResponseSchema);
};

if (require.main === module) {
  const doIt = async () => {
    getReferenceCardsForWholeBook().then((response) => {
      console.log(response);
    });
  };
  doIt();
}

// bierzemy calosc
// generujemy podsumowania/sceny CZY // generujemy detekcje per rozdzial kto jest w jakim paragrafie? (tu mozna sprawdzic tez ze + podsumowanie?)
// na bazie podsumowan/scen przepisujemy na zdania ktore sa self-contained
// wybieramy pierwsza scene w ktorej ktos sie pokazal
// generujemy na tej podstawie podsumowanie intro
