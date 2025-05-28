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
    return this.domParser.parseFromString(xmlString, "text/xml");
  }

  public serializeXml(xmlDoc: Document): string {
    const serializedXml = this.xmlSerializer.serializeToString(xmlDoc);
    return this.decodeHtmlEntities(serializedXml);
  }

  public getChapter(xmlDoc: Document, chapterNumber: number): Element | null {
    const chapters = xmlDoc.getElementsByTagName("Chapter");
    if (chapterNumber <= 0 || chapterNumber > chapters.length) {
      return null;
    }
    return chapters[chapterNumber - 1];
  }

  public getCharacters(xmlString: string): Element | null {
    const xmlDoc = this.domParser.parseFromString(xmlString, "text/xml");
    const charactersMaster = xmlDoc.getElementsByTagName("CharactersMaster")[0];
    if (!charactersMaster) {
      return null;
    }
    return charactersMaster;
  }

  public getCharactersTags(xmlString: string) {
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
  }

  public getParagraphs(chapter: Element): Element[] {
    return Array.from(chapter.childNodes).filter((node) => node.nodeType === 1) as Element[];
  }

  public getParagraphText(paragraph: Element): string {
    return paragraph.toString().replace(/^<[^>]+>|<\/[^>]+>$/g, "");
  }

  public updateParagraphContent(xmlDoc: Document, paragraph: Element, newContent: string): void {
    while (paragraph.firstChild) {
      paragraph.removeChild(paragraph.firstChild);
    }
    paragraph.appendChild(xmlDoc.createTextNode(newContent));
  }
}
