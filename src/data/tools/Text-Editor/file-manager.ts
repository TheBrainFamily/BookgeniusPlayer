import fs from "fs";
import { xmlToComplexHtml } from "@/data/xmlToComplexHtml";
import { BOOK_SLUGS } from "@/consts";
import { DOMParser } from "@xmldom/xmldom";
import { extractCharacterMetadata, getCharacterTags } from "@/data/tools/create-book-metadata";

export class FileManager {
  constructor(private readonly bookSlug: BOOK_SLUGS) {}

  public readXmlFile(): string {
    try {
      return fs.readFileSync(`./src/data/${this.bookSlug}-chapters.xml`, "utf8");
    } catch (error) {
      console.error("Error reading XML file:", error);
      throw new Error(`Failed to read XML file: ${error.message}`);
    }
  }

  public writeXmlFile(xmlContent: string): void {
    try {
      fs.writeFileSync(`./src/data/${this.bookSlug}-chapters.xml`, xmlContent, "utf-8");
    } catch (error) {
      console.error("Error writing XML file:", error);
      throw new Error(`Failed to write XML file: ${error.message}`);
    }
  }

  public regenerateXml(xmlString: string): void {
    try {
      this.writeXmlFile(xmlString);
      const htmlString = xmlToComplexHtml(xmlString, this.bookSlug);
      fs.writeFileSync(
        `./src/data/chapters-${this.bookSlug}.ts`,
        `export const ${this.bookSlugAsVariable(this.bookSlug).replace(/-/g, "")}BookXml = \`<section>${htmlString}</section>\`;`,
      );
      this.regenerateMetadata();
    } catch (error) {
      console.error("Error regenerating XML:", error);
      throw new Error(`Failed to regenerate XML: ${error.message}`);
    }
  }

  public regenerateMetadata(): void {
    try {
      const chaptersXml = this.readXmlFile();
      const parser = new DOMParser();
      const doc = parser.parseFromString(chaptersXml.replace(`<?xml version="1.0" encoding="UTF-8" ?>`, ""), "text/xml");
      const characterTags = getCharacterTags(doc);
      const metadata = extractCharacterMetadata(doc, characterTags);
      fs.writeFileSync(
        `./src/data/metadata-${this.bookSlug}.ts`,
        `export const ${this.bookSlugAsVariable(this.bookSlug).replaceAll("-", "")}CharactersData = ${JSON.stringify(metadata, null, 2)}`,
      );
    } catch (error) {
      console.error("Error regenerating metadata:", error);
      throw new Error(`Failed to regenerate metadata: ${error.message}`);
    }
  }

  private bookSlugAsVariable(bookSlug: string): string {
    return /^\d/.test(bookSlug) ? `_${bookSlug}` : bookSlug;
  }
}
