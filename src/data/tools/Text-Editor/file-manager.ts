import fs from "fs";
import { BOOK_SLUGS } from "@/consts";
import { FileError } from "./error-handlers";

export class FileManager {
  private readonly xmlFilePath: string;

  constructor(private readonly bookSlug: BOOK_SLUGS) {
    this.xmlFilePath = `./src/data/${this.bookSlug}-chapters.xml`;
  }

  public readXmlFile(): string {
    try {
      return fs.readFileSync(this.xmlFilePath, "utf8");
    } catch (error) {
      throw new FileError(`Failed to read XML file: ${error.message}`);
    }
  }

  public regenerateXml(xmlString: string): void {
    try {
      fs.writeFileSync(this.xmlFilePath, xmlString, "utf-8");
    } catch (error) {
      throw new FileError(`Failed to write XML file: ${error.message}`);
    }
  }
}
