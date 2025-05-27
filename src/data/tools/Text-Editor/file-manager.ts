import fs from "fs";
import { xmlToComplexHtml } from "@/data/xmlToComplexHtml";
import { BOOK_SLUGS } from "@/consts";
import { DOMParser } from "@xmldom/xmldom";
import { extractCharacterMetadata, getCharacterTags } from "@/data/tools/create-book-metadata";

export class FileManager {
  constructor(private readonly bookSlug: BOOK_SLUGS) {}

  public readXmlFile(): string {
    return fs.readFileSync(`./src/data/${this.bookSlug}-chapters.xml`, "utf8");
  }

  public writeXmlFile(xmlContent: string): void {
    fs.writeFileSync(`./src/data/${this.bookSlug}-chapters.xml`, xmlContent, "utf-8");
  }

  public regenerateXml(xmlString: string): void {
    this.writeXmlFile(xmlString);
    const htmlString = xmlToComplexHtml(xmlString, this.bookSlug);
    fs.writeFileSync(`./src/data/chapters-${this.bookSlug}.ts`, `export const ${this.bookSlug.replace(/-/g, "")}BookXml = \`<section>${htmlString}</section>\`;`);
    this.regenerateMetadata();
  }

  public regenerateMetadata(): void {
    const chaptersXml = this.readXmlFile();
    const parser = new DOMParser();
    const doc = parser.parseFromString(chaptersXml.replace(`<?xml version="1.0" encoding="UTF-8" ?>`, ""), "text/xml");
    const characterTags = getCharacterTags(doc);
    const metadata = extractCharacterMetadata(doc, characterTags);
    fs.writeFileSync(`./src/data/metadata-${this.bookSlug}.ts`, `export const ${this.bookSlug.replaceAll("-", "")}CharactersData = ${JSON.stringify(metadata, null, 2)}`);
  }
}
