// Define a type for parsed chapters
import { z } from "zod";
import { NewReferenceCardsResponseSchema } from "./schemes";

export type Chapter = { number: number; title: string; content: string };

export type NewReferenceCardsResponse = z.infer<typeof NewReferenceCardsResponseSchema>;
