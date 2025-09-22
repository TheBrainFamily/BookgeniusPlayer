import { Location } from "./state/LocationContext";
import { Filter } from "./types/book";
import { getSurroundingText } from "@player/utils/getSurroundingText";
import { bookDataLoader } from "./services/bookDataLoader";
import { ANSWERS_SERVER_URL } from "./lib/consts";

export async function askCall(searchQuery: string, location: Location): Promise<string> {
  const filter: Filter = {
    chapterFrom: 1, // Based on the curl example
    chapterTo: location.endChapter,
    paragraphTo: location.endParagraph,
    bookSlug: bookDataLoader.getCurrentBook(),
  };

  const surroundingText = getSurroundingText(location);

  const compiledSearchQuery = `<userQuery>${searchQuery}</userQuery>

The user is looking at the following text:
<VisibleText>${surroundingText}</VisibleText>`;
  console.log("compiledSearchQuery", compiledSearchQuery);

  const params = new URLSearchParams({ question: compiledSearchQuery, filter: JSON.stringify(filter) });

  const url = `${ANSWERS_SERVER_URL}/ask?${params.toString()}`;
  const isDev = import.meta.env.MODE === "development";

  console.log(`Fetching ask from: ${url}`); // Optional: for debugging
  try {
    const response = await fetch(url, { method: "GET", headers: { ...(isDev && { "X-Dev-Token": import.meta.env.VITE_DEV_TOKEN }) } });
    if (!response.ok) {
      // Throw an error with status text for better debugging
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    const resultText = await response.text();
    console.log("Received deep research text:", resultText); // Optional: for debugging
    return resultText;
  } catch (error) {
    console.error("Error fetching deep research:", error);
    // Depending on desired behavior, you might want to return an empty string,
    // display an error message to the user, or re-throw the error.
    return ""; // Return empty string on error for now
  }
}
