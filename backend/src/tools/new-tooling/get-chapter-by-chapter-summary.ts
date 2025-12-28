import { callClaude, callGeminiWrapper } from "../../callClaude";
import { getChaptersUpTo } from "../../helpers/getChaptersUpTo";
import { getBookSettings } from "../../helpers/getBookSettings";
import { writeBookFile } from "../../helpers/writeBookFile";
import { readBookFile } from "../../helpers/readBookFile";
import { FILE_TYPE } from "../../helpers/filesHelpers";
import { logger } from "../../logger";

export const makeRollingChapterSummaries = async () => {
  const bookSettings = getBookSettings();
  const filteredChapters = getChaptersUpTo(
    bookSettings.startFromChapter || 1,
    bookSettings.startFromChapter + bookSettings.numberOfChaptersToProcess - 1,
  ).filter((chapter) => chapter.number >= 0);

  let previousSummaries = "";

  let previousPartSummaries = "";
  try {
    previousPartSummaries = readBookFile(`book-so-far-summary.txt`, FILE_TYPE.TEMPORARY);
  } catch {
    logger.warning("No previous part summaries found, will not include it in the prompt");
  }

  const previousPartSummariesPrompt = `
  ### Previous Tome Summary

Here is a summary of the first part of the book for the reference:

${previousPartSummaries}`;

  // const firstPartSummary = readBookFile(`book-so-far-summary.txt`, FILE_TYPE.TEMPORARY);
  // if (!firstPartSummary || firstPartSummary.trim().length === 0) {
  //   throw new Error("no first part summary");
  // }

  const doSummary = async (chapter: { number: number; content: string }, attempt: number) => {
    if (attempt > 4) {
      logger.error(`Error for chapter ${chapter.number}`, "Too many attempts");
      throw new Error("Too many attempts");
    }
    const chapterNumber = chapter.number;
    const prompt = `
## Fiction Book Chapter Summary

### Instructions:

You are summarizing a fiction book, chapter by chapter. When summarizing each chapter, you must explicitly refer to characters by name. Additionally, each summary should take into account the summaries of previous chapters, clearly showing continuity and character development over time.

Your summary must be concise yet detailed, always explicitly mentioning the names of characters whenever describing events, actions, or decisions. Each chapter summary should clearly indicate:

Plot Events, describe the main events occurring in the chapter, explicitly mentioning involved characters by name. Clearly indicate specific actions taken or important decisions made by each named character.

Always refer explicitly to the characters by their full names (or commonly used names as found in the text) to ensure summaries are searchable by character references. Maintain consistent structure for each chapter.

Start with short summary of how this chapter fits into the overall plot, in a way that if someone read just this summary, they would be able to understand the overall plot of the book and how this chapter fits into it.

Follow the chronological flow of the chapter, in general, every sentence should be a summary of a group of paragraphs / a scene.

### Format

Short, concise sentences. More like a telegram defining what happened than a nicely written abridged rewrite. Pack as much information in as few words as possible. 



### Context for Current Summary:

Here is a summary of all previous chapters for reference:
${previousSummaries || "*(No previous chapters yet.)*"}

${previousPartSummaries ? previousPartSummariesPrompt : ""}

## Chapter ${chapterNumber} to Summarize:

${chapter.content}

Provide your summary clearly organized according to the structure above, explicitly mentioning all involved characters by their names.
  `;

    // Use `prompt` with your LLM here and store the output as `summary`
    const llmProviders = [callGeminiWrapper, callClaude];
    const selectedProvider = llmProviders[attempt % llmProviders.length];
    try {
      const summary = await selectedProvider(
        `${prompt}\n Reply in the language of the book. It's usually Polish or English. Your instructions are in English so you often reply in English, buts its VERY important to reply in Polish when the book is in Polish, and same goes for other languages.`,
      ); // Replace with actual LLM output
      return summary;
    } catch (e) {
      logger.error(`Error for chapter ${chapter.number}`, e);
      return doSummary(chapter, attempt + 1);
    }
  };

  for (const chapter of filteredChapters) {
    const summary = await doSummary(chapter, 0);
    console.log(`Chapter ${chapter.number} summary:`, summary);
    // Update previousSummaries
    previousSummaries += `\n\n### Chapter ${chapter.number}\n${summary}`;
    writeBookFile(`summaries-chapter-by-chapter-${chapter.number}.txt`, `${summary as string}`);
  }

  writeBookFile("summaries-chapter-by-chapter.txt", previousSummaries);
};

if (require.main === module) {
  makeRollingChapterSummaries();
}
