import { pharaonCharactersData } from "@/src/data/pharaon-metadata";
import { faraonBookXml } from "@/src/data/chapters-pharaon";
import { BookData } from "../types";

export const bookData: BookData = { slug: "Pharaon", metadata: { title: "Pharaon" }, charactersData: pharaonCharactersData, bookXml: faraonBookXml, chapters: 100 };
