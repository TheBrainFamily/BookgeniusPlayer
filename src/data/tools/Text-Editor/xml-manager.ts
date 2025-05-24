import { DOMParser, Document, XMLSerializer, Element } from "@xmldom/xmldom";

export class XmlManager {
  private static decodeHtmlEntities(text: string): string {
    const entities: { [key: string]: string } = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'" };
    return text.replace(/&(?:lt|gt|amp|quot|#39);/g, (match) => entities[match]);
  }

  public static parseXml(xmlString: string): Document {
    const parser = new DOMParser();
    return parser.parseFromString(xmlString, "text/xml");
  }

  public static serializeXml(xmlDoc: Document): string {
    const serializer = new XMLSerializer();
    const serializedXml = serializer.serializeToString(xmlDoc);
    return this.decodeHtmlEntities(serializedXml);
  }

  public static getChapter(xmlDoc: Document, chapterNumber: number): Element | null {
    const chapters = xmlDoc.getElementsByTagName("Chapter");
    if (chapterNumber <= 0 || chapterNumber > chapters.length) {
      return null;
    }
    return chapters[chapterNumber - 1];
  }

  public static getParagraphs(chapter: Element): Element[] {
    return Array.from(chapter.childNodes).filter((node) => node.nodeType === 1) as Element[];
  }

  public static getParagraphText(paragraph: Element): string {
    return paragraph.toString().replace(/^<[^>]+>|<\/[^>]+>$/g, "");
  }

  public static updateParagraphContent(xmlDoc: Document, paragraph: Element, newContent: string): void {
    while (paragraph.firstChild) {
      paragraph.removeChild(paragraph.firstChild);
    }
    paragraph.appendChild(xmlDoc.createTextNode(newContent));
  }
}
