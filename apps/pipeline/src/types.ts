// Define a type for parsed chapters
import { type z } from "zod";
import { type NewReferenceCardsResponseSchema } from "./schemes";

export type Chapter = { number: number; title: string; content: string };

export type NewReferenceCardsResponse = z.infer<typeof NewReferenceCardsResponseSchema>;
