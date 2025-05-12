import { ConradTajnyAgentCharactersData } from "@/data/metadata-Conrad-Tajny-Agent";
import { ConradTajnyAgentBookXml } from "@/data/chapters-Conrad-Tajny-Agent";
import { BookData } from "../types";

export const bookData: BookData = {
  slug: "conrad-tajny-agent",
  metadata: { title: "Conrad Tajny Agent" },
  charactersData: ConradTajnyAgentCharactersData,
  bookXml: ConradTajnyAgentBookXml,
  chapters: 100,
};
