import { expect, test } from "vitest";
import {
  parseSearchParagraphsServerResponse,
  type SearchParagraphsServerResponse,
} from "./searchParagraphsFromServer";

test("parseSearchParagraphsServerResponse", () => {
  const response: SearchParagraphsServerResponse[] = [
    {
      chapter: 1,
      paragraphNumber: 1,
      text: "<Summary>Sara próbuje pocieszyć Ramzesa.</Summary> <Text>W tej chwili usłyszał między drzewami cichy szelest</Text>",
      score: 0.9,
    },
  ];
  const result = parseSearchParagraphsServerResponse(response);
  expect(result).toEqual([
    {
      chapter: 1,
      paragraphNumber: 1,
      text: "W tej chwili usłyszał między drzewami cichy szelest",
      summary: "Sara próbuje pocieszyć Ramzesa.",
      score: 0.9,
    },
  ]);
});
