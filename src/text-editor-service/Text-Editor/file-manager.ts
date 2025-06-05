import fs from "fs";
import { BOOK_SLUGS } from "@/consts";
import { FileError } from "./error-handlers";

export interface IFileManager {
  readXmlFile(): string;
  regenerateXml(xmlString: string): void;
}

export class FileManager implements IFileManager {
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

export class MockFileManager implements IFileManager {
  private xmlContent: string =
    '<?xml version="1.0" encoding="UTF-8" ?>\n<ebook>\n    <Chapter id="1">\n        <h3>Chapter Title</h3>\n        <p>First paragraph with <John>John</John> character</p>\n        <blockquote>A quote with <em>emphasis</em></blockquote>\n        <p>Second paragraph</p>\n    </Chapter>\n    <Chapter id="2">\n        <h3>Chapter 2</h3>\n        <p>Third paragraph</p>\n        <p>Fourth paragraph</p>\n    </Chapter>\n    <Chapter id="3">\n        <h3>Chapter 3</h3>\n        <p>Paragraph with multiple <John>first John</John>, and <John>second</John></p>\n        <p>Fourth paragraph</p>\n    </Chapter>\n</ebook>';

  public readXmlFile(): string {
    return this.xmlContent;
  }

  public regenerateXml(xmlString: string): void {
    this.xmlContent = xmlString;
  }
}
