import fs from "fs";
import { xmlToComplexHtml } from "@/data/xmlToComplexHtml";
import { BOOK_SLUGS } from "@/consts";

export class FileManager {
  constructor(private readonly bookSlug: BOOK_SLUGS) {}

  public readXmlFile(): string {
    return fs.readFileSync(`./src/data/${this.bookSlug}-chapters.xml`, "utf8");
  }

  public writeXmlFile(xmlContent: string): void {
    fs.writeFileSync(`./src/data/${this.bookSlug}-chapters.xml`, xmlContent, "utf-8");
  }

  public regenerateXml(xmlString: string): void {
    const htmlString = xmlToComplexHtml(xmlString, this.bookSlug);
    fs.writeFileSync(`./src/data/chapters-${this.bookSlug}.ts`, `export const ${this.bookSlug.replace(/-/g, "")}BookXml = \`<section>${htmlString}</section>\`;`);
  }
}
