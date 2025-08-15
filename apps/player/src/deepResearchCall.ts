import { Location } from "./state/LocationContext";
import { Filter } from "./types/book";
import { DEV_SERVER_URL } from "@player/lib/consts";
import { bookDataLoader } from "@player/services/bookDataLoader";

export async function deepResearchCall(searchQuery: string, location: Location): Promise<string> {
  const baseUrl = "/deepResearch"; // Assuming localhost for now
  const filter: Filter = {
    chapterFrom: 1, // Based on the curl example
    chapterTo: location.chapter,
    paragraphTo: location.paragraph + 1,
    bookSlug: bookDataLoader.getCurrentBook(),
  };

  const params = new URLSearchParams({ question: searchQuery, filter: JSON.stringify(filter) });

  let url = `/api/${baseUrl}?${params.toString()}`;
  const isDev = import.meta.env.MODE === "development";
  if (isDev) {
    url = `${DEV_SERVER_URL}${url}`;
  }
  console.log(`Fetching deep research from: ${url}`); // Optional: for debugging
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
