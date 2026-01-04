// Define the schema for reference cards response
import { z } from "zod";

export const ReferenceCardsResponseSchema = z.object({
  characters: z.array(
    z.object({
      name: z.string().describe("Character's full name"),
      referenceCardsForChapter: z.array(
        z.object({
          chapter: z.number().describe("The chapter number (N) this card is relevant FOR"),
          text: z.string().describe("Summary based ONLY on info from Chapters 1 to N. Short, concise 1-2 sentences."),
        }),
      ),
    }),
  ),
});

export const NewReferenceCardsResponseSchema = z.object({
  characters: z.array(
    z.object({
      name: z.string().describe("Character's full name"),
      referenceCard: z.string().describe("Background summary of the character. No spoilers."),
    }),
  ),
});
