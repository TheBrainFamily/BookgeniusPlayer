import { getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { bookDataLoader } from "@player/services/bookDataLoader";
import { normalizeSrcForInlineAvatar } from "@player/ui/pageObserver";
import { getListeningMediaFilePathForName } from "@player/utils/getFilePathsForName";

export const replaceXmlTagsIntoHtmlTags = (text: string) => {
  const characters = getCharactersData(); // Get characters data once
  const characterSlugs = characters.map((char) => char.slug); // Get all valid slugs

  // Escape special regex characters in slugs if necessary (e.g., if slugs could contain '.', '+', etc.)
  // For your current slugs (alphanumeric + hyphen), this isn't strictly needed,
  // but it's good practice for robustness.
  const escapedSlugs = characterSlugs.map((slug) => slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  // Create a regex pattern that matches ANY of the valid character slugs
  // This will look like: <(Alice|White-Rabbit|Another-Character)>(.*?)<\/\1>
  const characterTagPattern = escapedSlugs.join("|"); // Joins slugs with '|' for OR condition

  // If no characters are found, return the original text to prevent an empty regex pattern
  if (!characterTagPattern) {
    console.warn("No characters found in getCharactersData. No tags will be replaced.");
    return text;
  }

  const regex = new RegExp(`<(${characterTagPattern})>(.*?)<\\/\\1>`, "g");

  let outputText = text;

  if (characterTagPattern) {
    outputText = outputText.replace(regex, (match, tagName, content) => {
      const foundCharacter = characters.find((char) => char.slug.toLowerCase() === tagName.toLowerCase());

      if (!foundCharacter) {
        console.warn(`Internal error: Character data not found for tag: ${tagName}. This should not happen with the dynamic regex.`);
        return match;
      }

      const newAttributes = { class: "character-highlighted", "data-character": foundCharacter.slug };

      const attributeString = Object.entries(newAttributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ");

      return `<span ${attributeString}>${content}</span>`;
    });
  }

  // Handle self-closing tags like <alice talking="true" />
  const selfClosingRegex = new RegExp(`<(${characterTagPattern})\\s+(talking|listening)="true"\\s*\\/>`, "gi");
  outputText = outputText.replace(selfClosingRegex, (match, tagName, attribute, offset) => {
    const foundCharacter = characters.find((char) => char.slug.toLowerCase() === tagName.toLowerCase());

    if (!foundCharacter) {
      console.warn(`Internal error: Character data not found for tag: ${tagName}. This should not happen with the dynamic regex.`);
      return match;
    }

    const attributeName = attribute.toLowerCase();

    const newAttributes = {
      class: `character-placeholder character-${attributeName} ${offset === 0 ? "start-of-paragraph" : ""}`,
      "data-character": foundCharacter.slug,
      [`data-is-${attributeName}`]: "true",
      "data-media-injected": "true",
    };

    const attributeString = Object.entries(newAttributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(" ");

    const imgTag = `<img src="${normalizeSrcForInlineAvatar(getListeningMediaFilePathForName(foundCharacter.slug, bookDataLoader.getCurrentBook()))}" class="inline-avatar" data-character="${foundCharacter.slug}" title="${foundCharacter.slug}" />`;

    return `<span ${attributeString}>${imgTag}</span>`;
  });

  // Handle LineBreak tags
  outputText = outputText.replace(/<LineBreak\s*\/>/g, '<span style="display:block; height:0; margin:0; padding:0; line-height:1.2em;"></span>');

  return outputText;
};
