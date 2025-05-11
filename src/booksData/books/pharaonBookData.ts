import { PharaonCharactersData } from "@/data/metadata-Pharaon";
import { PharaonBookXml } from "@/data/chapters-pharaon";
import { BookData } from "../types";

export const bookData: BookData = { slug: "Pharaon", metadata: { title: "Pharaon" }, charactersData: PharaonCharactersData, bookXml: PharaonBookXml, chapters: 100 };
