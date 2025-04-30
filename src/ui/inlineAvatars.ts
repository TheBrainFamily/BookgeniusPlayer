import { pharaonCharactersData } from "@/src/data/metadata";

interface Character {
  _id: { $oid: string };
  characterName: string;
  canonicalName?: string;
  bookSlug: string;
  aliases?: string[];
  imageUrl: string;
  type?: string;
  __v: number;
  infoPerChapter: { chapter: number; summary: string; paragraphsWhereSpotted: number[]; paragraphsWhereTalking: number[] }[];
}

export function setupInlineAvatars(): void {
  const contentContainer = document.getElementById("content-container");
  if (!contentContainer) return;

  // Process all paragraphs to add character avatars
  processContentForCharacters();
}

function processContentForCharacters(): void {
  const paragraphs = document.querySelectorAll("#content-container section[data-chapter] [data-index]");

  paragraphs.forEach((paragraph) => {
    const section = paragraph.closest("section[data-chapter]") as HTMLElement | null;
    if (!section) return;

    const chapterNumber = section.getAttribute("data-chapter");
    const paragraphNumber = paragraph.getAttribute("data-index");

    if (!chapterNumber || !paragraphNumber) return;

    const chapterNum = parseInt(chapterNumber);
    const paragraphNum = parseInt(paragraphNumber);

    // Get characters that appear in this paragraph
    const charactersInParagraph = findCharactersInParagraph(chapterNum, paragraphNum);

    // If there are characters, process the paragraph content
    if (charactersInParagraph.length > 0) {
      addCharacterAvatarsToParagraph(paragraph as HTMLElement, charactersInParagraph);
    }
  });
}

function findCharactersInParagraph(chapter: number, paragraph: number): Character[] {
  // Filter character data to find those that appear in this paragraph
  return pharaonCharactersData.filter((character) => {
    return character.infoPerChapter.some(
      (info) => info.chapter === chapter && (info.paragraphsWhereSpotted.includes(paragraph) || info.paragraphsWhereTalking.includes(paragraph)),
    );
  }) as Character[]; // Type assertion to match our interface
}

function addCharacterAvatarsToParagraph(paragraph: HTMLElement, characters: Character[]): void {
  let content = paragraph.innerHTML;

  // For each character, find mentions in the text and replace with avatar+name
  characters.forEach((character) => {
    // Use characterName if canonicalName is not available
    const name = character.canonicalName || character.characterName;
    const aliases = character.aliases || [];
    const allNames = [name, ...aliases];
    const characterId = character._id.$oid;

    allNames.forEach((nameVariant) => {
      // Only process if the name actually appears in the content
      if (content.includes(nameVariant)) {
        const avatar = `<img class="inline-avatar" src="/background-sara.png" alt="${nameVariant}" />`;
        const replacementHTML = `<span class="character-mention" data-character-id="${characterId}" data-character-type="${character.type || "supporting"}">${avatar}${nameVariant}</span>`;

        // Use regex with word boundaries to avoid partial word matches
        const regex = new RegExp(`\\b${nameVariant}\\b`, "g");
        content = content.replace(regex, replacementHTML);
      }
    });
  });

  // Update the paragraph content
  paragraph.innerHTML = content;
}
