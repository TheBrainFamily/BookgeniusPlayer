import fs from "fs";
import { xmlToComplexHtml } from "@/data/xmlToComplexHtml";
import { BOOK_SLUGS } from "@/consts";
import { DOMParser } from "@xmldom/xmldom";
import { extractCharacterMetadata, getCharacterTags } from "@/data/tools/create-book-metadata";
import { FileError } from "./error-handlers";

export class FileManager {
  private readonly xmlFilePath: string;
  private readonly htmlFilePath: string;
  private readonly metadataFilePath: string;

  constructor(private readonly bookSlug: BOOK_SLUGS) {
    this.xmlFilePath = `./src/data/${this.bookSlug}-chapters.xml`;
    this.htmlFilePath = `./src/data/chapters-${this.bookSlug}.ts`;
    this.metadataFilePath = `./src/data/metadata-${this.bookSlug}.ts`;
  }

  public readXmlFile(): string {
    try {
      return fs.readFileSync(this.xmlFilePath, "utf8");
    } catch (error) {
      throw new FileError(`Failed to read XML file: ${error.message}`);
    }
  }

  public writeXmlFile(xmlContent: string): void {
    try {
      fs.writeFileSync(this.xmlFilePath, xmlContent, "utf-8");
    } catch (error) {
      throw new FileError(`Failed to write XML file: ${error.message}`);
    }
  }

  public regenerateXml(xmlString: string): void {
    try {
      this.writeXmlFile(xmlString);
      const htmlString = xmlToComplexHtml(xmlString, this.bookSlug);
      const variableName = this.bookSlugAsVariable(this.bookSlug).replace(/-/g, "");

      fs.writeFileSync(this.htmlFilePath, `export const ${variableName}BookXml = \`<section>${htmlString}</section>\`;`);

      this.regenerateMetadata();
    } catch (error) {
      throw new FileError(`Failed to regenerate XML: ${error.message}`);
    }
  }

  public regenerateMetadata(): void {
    try {
      const chaptersXml = this.readXmlFile();
      const parser = new DOMParser();
      const doc = parser.parseFromString(chaptersXml.replace(`<?xml version="1.0" encoding="UTF-8" ?>`, ""), "text/xml");

      const characterTags = getCharacterTags(doc);
      const metadata = extractCharacterMetadata(doc, characterTags);
      const variableName = this.bookSlugAsVariable(this.bookSlug).replaceAll("-", "");

      fs.writeFileSync(this.metadataFilePath, `export const ${variableName}CharactersData = ${JSON.stringify(metadata, null, 2)}`);
    } catch (error) {
      throw new FileError(`Failed to regenerate metadata: ${error.message}`);
    }
  }

  private bookSlugAsVariable(bookSlug: string): string {
    return /^\d/.test(bookSlug) ? `_${bookSlug}` : bookSlug;
  }
}
