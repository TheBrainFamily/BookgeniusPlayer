// Define a type for parsed chapters
import { type z } from "zod";
import { type NewReferenceCardsResponseSchema } from "./schemes";

export type Chapter = { number: number; title: string; content: string };

export type NewReferenceCardsResponse = z.infer<typeof NewReferenceCardsResponseSchema>;

export type CharacterWithName = {
  name: string;
  slug?: string;
  referenceCard?: string;
  visualGuide?: string;
  role?: string;
  [key: string]: unknown;
};

export type CharacterListResponse<TCharacter extends CharacterWithName = CharacterWithName> = {
  characters: TCharacter[];
};
