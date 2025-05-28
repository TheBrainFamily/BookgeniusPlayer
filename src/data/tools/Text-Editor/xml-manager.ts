import { DOMParser, Document, XMLSerializer, Element } from "@xmldom/xmldom";

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
      console.error("Error parsing XML:", error);
      throw new Error(`Failed to parse XML: ${error.message}`);
    }
  }

  public serializeXml(xmlDoc: Document): string {
    try {
      const serializedXml = this.xmlSerializer.serializeToString(xmlDoc);
      return this.decodeHtmlEntities(serializedXml);
    } catch (error) {
      console.error("Error serializing XML:", error);
      throw new Error(`Failed to serialize XML: ${error.message}`);
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
      console.error("Error getting chapter:", error);
      throw new Error(`Failed to get chapter: ${error.message}`);
    }
  }

  public getCharacters(xmlString: string): Element | null {
    try {
      const xmlDoc = this.domParser.parseFromString(xmlString, "text/xml");
      const charactersMaster = xmlDoc.getElementsByTagName("CharactersMaster")[0];
      if (!charactersMaster) {
        return null;
      }
      return charactersMaster;
    } catch (error) {
      console.error("Error getting characters:", error);
      throw new Error(`Failed to get characters: ${error.message}`);
    }
  }

  public getCharactersTags(xmlString: string) {
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
      console.error("Error getting character tags:", error);
      throw new Error(`Failed to get character tags: ${error.message}`);
    }
  }

  public getParagraphs(chapter: Element): Element[] {
    try {
      return Array.from(chapter.childNodes).filter((node) => node.nodeType === 1) as Element[];
    } catch (error) {
      console.error("Error getting paragraphs:", error);
      throw new Error(`Failed to get paragraphs: ${error.message}`);
    }
  }

  public getParagraphText(paragraph: Element): string {
    try {
      return paragraph.toString().replace(/^<[^>]+>|<\/[^>]+>$/g, "");
    } catch (error) {
      console.error("Error getting paragraph text:", error);
      throw new Error(`Failed to get paragraph text: ${error.message}`);
    }
  }

  public updateParagraphContent(xmlDoc: Document, paragraph: Element, newContent: string): void {
    try {
      while (paragraph.firstChild) {
        paragraph.removeChild(paragraph.firstChild);
      }
      paragraph.appendChild(xmlDoc.createTextNode(newContent));
    } catch (error) {
      console.error("Error updating paragraph content:", error);
      throw new Error(`Failed to update paragraph content: ${error.message}`);
    }
  }
}
