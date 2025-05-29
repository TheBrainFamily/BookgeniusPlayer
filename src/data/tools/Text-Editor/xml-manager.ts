import { DOMParser, Document, XMLSerializer, Element } from "@xmldom/xmldom";
import { XmlError } from "./error-handlers";

export class XmlManager {
  private readonly xmlSerializer: XMLSerializer;
  private readonly domParser: DOMParser;

  constructor() {
    this.xmlSerializer = new XMLSerializer();
    this.domParser = new DOMParser();
  }

  private decodeHtmlEntities(text: string): string {
    const entities: { [key: string]: string } = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'" };
    return text.replace(/&(?:lt|gt|amp|quot|#39);/g, (match) => entities[match]);
  }

  public parseXml(xmlString: string): Document {
    try {
      return this.domParser.parseFromString(xmlString, "text/xml");
    } catch (error) {
      throw new XmlError(`Failed to parse XML: ${error.message}`);
    }
  }

  public serializeXml(xmlDoc: Document): string {
    try {
      const serializedXml = this.xmlSerializer.serializeToString(xmlDoc);
      return this.decodeHtmlEntities(serializedXml);
    } catch (error) {
      throw new XmlError(`Failed to serialize XML: ${error.message}`);
    }
  }

  public getChapter(xmlDoc: Document, chapterNumber: number): Element | null {
    try {
      const chapters = xmlDoc.getElementsByTagName("Chapter");
      if (chapterNumber <= 0 || chapterNumber > chapters.length) {
        return null;
      }
      return chapters[chapterNumber - 1];
    } catch (error) {
      throw new XmlError(`Failed to get chapter: ${error.message}`);
    }
  }

  public getCharacters(xmlString: string): Element | null {
    try {
      const xmlDoc = this.domParser.parseFromString(xmlString, "text/xml");
      const charactersMaster = xmlDoc.getElementsByTagName("CharactersMaster")[0];
      return charactersMaster || null;
    } catch (error) {
      throw new XmlError(`Failed to get characters: ${error.message}`);
    }
  }

  public getCharactersTags(xmlString: string): string[] | null {
    try {
      const charactersMaster = this.getCharacters(xmlString);
      if (!charactersMaster) {
        return null;
      }

      return Array.from(charactersMaster.childNodes)
        .filter((node): node is Element => node.nodeType === 1)
        .map((child) => {
          const attributes = Array.from(child.attributes)
            .map((attr) => `${attr.name}="${attr.value}"`)
            .join(" ");
          return `<${child.tagName}${attributes ? " " + attributes : ""} />`;
        });
    } catch (error) {
      throw new XmlError(`Failed to get character tags: ${error.message}`);
    }
  }

  public getParagraphs(chapter: Element): Element[] {
    try {
      return Array.from(chapter.childNodes).filter((node) => node.nodeType === 1) as Element[];
    } catch (error) {
      throw new XmlError(`Failed to get paragraphs: ${error.message}`);
    }
  }

  public getParagraphText(paragraph: Element): string {
    try {
      return paragraph.toString().replace(/^<[^>]+>|<\/[^>]+>$/g, "");
    } catch (error) {
      throw new XmlError(`Failed to get paragraph text: ${error.message}`);
    }
  }

  public getParagraphHtml(paragraph: Element): string {
    try {
      return paragraph.toString();
    } catch (error) {
      throw new XmlError(`Failed to get paragraph html: ${error.message}`);
    }
  }

  public stringToElement(htmlString: string): Element {
    try {
      const doc = this.domParser.parseFromString(htmlString, "text/xml");
      return doc.documentElement;
    } catch (error) {
      throw new XmlError(`Failed to convert string to element: ${error.message}`);
    }
  }

  public updateParagraphContent(xmlDoc: Document, paragraph: Element, newContent: string): void {
    try {
      while (paragraph.firstChild) {
        paragraph.removeChild(paragraph.firstChild);
      }
      paragraph.appendChild(xmlDoc.createTextNode(newContent));
    } catch (error) {
      throw new XmlError(`Failed to update paragraph content: ${error.message}`);
    }
  }

  public getParagraphElement(xmlDoc: Document, chapterNumber: number, paragraphNumber: number): { paragraph: Element | null; xmlDoc: Document } {
    const chapter = this.getChapter(xmlDoc, chapterNumber);
    if (!chapter) {
      return { paragraph: null, xmlDoc };
    }

    const paragraphs = this.getParagraphs(chapter);
    if (paragraphNumber < 0 || paragraphNumber >= paragraphs.length) {
      return { paragraph: null, xmlDoc };
    }

    return { paragraph: paragraphs[paragraphNumber], xmlDoc };
  }

  public updateAndSaveXml(xmlDoc: Document, paragraph: Element, newContent: string): string {
    this.updateParagraphContent(xmlDoc, paragraph, newContent);
    return this.serializeXml(xmlDoc);
  }
}
