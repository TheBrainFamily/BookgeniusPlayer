import { type Location } from "./state/LocationContext";
import { type Filter } from "./types/book";
import { ANSWERS_SERVER_URL } from "@player/lib/consts";
import { getBookSlug } from "./state/bookDataStore";
import { getSurroundingText } from "./utils/getSurroundingText";

export async function deepResearchCall(searchQuery: string, location: Location): Promise<string> {
  const slug = getBookSlug();
  if (!slug) throw new Error("[deepResearchCall] Book slug not available");

  const filter: Filter = {
    chapterFrom: 1, // Based on the curl example
    chapterTo: location.latestVisibleChapter,
    paragraphTo: location.latestVisibleParagraph + 1,
    bookSlug: slug,
  };

  const surroundingText = getSurroundingText(location);

  const compiledSearchQuery = `<userQuery>${searchQuery}</userQuery>

The user is looking at the following text:
<VisibleText>${surroundingText}</VisibleText>`;

  const params = new URLSearchParams({
    question: compiledSearchQuery,
    filter: JSON.stringify(filter),
  });

  const url = `${ANSWERS_SERVER_URL}/deepResearch?${params.toString()}`;
  const isDev = import.meta.env.MODE === "development";
  console.log(`Fetching deep research from: ${url}`); // Optional: for debugging
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { ...(isDev && { "X-Dev-Token": import.meta.env.VITE_DEV_TOKEN }) },
    });
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
