import { Location } from "./state/LocationContext";

export async function deepResearchCall(searchQuery: string, location: Location): Promise<string> {
  const baseUrl = "/api/deepResearch"; // Assuming localhost for now
  const filter = {
    chapterFrom: 1, // Based on the curl example
    chapterTo: location.chapter,
    paragraphTo: location.paragraph + 1,
  };

  const params = new URLSearchParams({ question: searchQuery, filter: JSON.stringify(filter) });

  const url = `${baseUrl}?${params.toString()}`;
  console.log(`Fetching deep research from: ${url}`); // Optional: for debugging

  try {
    const response = await fetch(url);
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
