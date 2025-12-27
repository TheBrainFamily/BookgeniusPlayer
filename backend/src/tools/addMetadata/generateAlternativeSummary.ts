import { callClaude } from "../../callClaude";

export const generateAlternativeSummary = async (
  latestCharacterSummary: string,
  pageWithTextUpToMention: string,
  chapterContext: string,
  characterName: string,
) => {
  // Add chapter context if available
  const contextSections: string[] = [];

  if (chapterContext) {
    contextSections.push(`Story context: <storyContext>${chapterContext}</storyContext>`);
  }

  contextSections.push(`Latest character background: <backgroundInfo>${latestCharacterSummary}</backgroundInfo>`);

  contextSections.push(`Current page: <page>${pageWithTextUpToMention}</page>`);

  const combinedContext = contextSections.join("\n\n");

  const prompt = `
  You are an expert at summarizing story character information.
  Based on the curent page text, the story context so far, and the latest character background info,
  reply with a very brief contextual summary (1 sentence) based on the current page text describing who ${characterName} is.
  It should be a reply to a user asking, while seeing this character on a page - "Who is ${characterName}? What do I know about them?"
  It should allow the reader to remember quickly who this character is, after they returned to the book after some time.
  Focus on reminding the reader who the character *is* based on past context (role, relationships, key history), not what they *do* or *say* in the current chapter (N). Avoid spoilers!
  Do not write more than 1-2 short sentences about the person. This is not a summary of a book, this is a memory-jog to quickly get someone to connect character name with the actual character.
  Once again, it's EXTREMELY IMPORTANT TO AVOID USING INFORMATION FROM SUBSEQUENT CHAPTERS OR FROM YOUR EXISTING KNOWLEDGE. PEOPLE HATE SPOILERS. IF UNSURE IF SOMETHING IS A SPOILER ERR ON THE SIDE OF CAUTION.

  ${combinedContext}
  
  Don't spoil anything, use only the context provided.
  Don't repeat the person name, or do any formatting. Reply with a plain text sentence.
  `;

  return callClaude(prompt);
};
