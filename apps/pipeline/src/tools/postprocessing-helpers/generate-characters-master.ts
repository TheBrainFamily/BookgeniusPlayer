import { FILE_TYPE } from "../../helpers/filesHelpers";
import { readBookFile } from "../../helpers/readBookFile";
import { writeBookFile } from "../../helpers/writeBookFile";
import { type NewReferenceCardsResponse } from "../../types";

import { generateTagName } from "../../helpers/generateTagName";

export const generateCharactersMaster = (
  singleSummaryPerPerson = "single-summary-per-person.json",
) => {
  const referenceCards = JSON.parse(
    readBookFile(singleSummaryPerPerson, FILE_TYPE.PERMANENT),
  ) as NewReferenceCardsResponse;

  const knownCharacters: string[] = [];

  const xmlCharacters = referenceCards.characters
    .filter((entity) => entity.name)
    .filter((entity) => !knownCharacters.includes(entity.name))
    .map((entity) => {
      const tagName = generateTagName(entity.name.trim());
      const displayName = entity.name.trim().replace(/"/g, "&quot;"); // Escape quotes for XML attribute
      const summaryText = entity.referenceCard.trim().replace(/"/g, "&quot;"); // Escape quotes for XML attribute
      return `<${tagName} display="${displayName}" summary="${summaryText}" />`;
    })
    .join("\n");

  writeBookFile(
    "characters-master-summaries.xml",
    `<CharactersMaster>${xmlCharacters}</CharactersMaster>`,
    FILE_TYPE.PERMANENT,
  );
};
