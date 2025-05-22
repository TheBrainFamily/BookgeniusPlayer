import { BOOK_SLUGS } from "@/consts";
import { DOMParser } from "@xmldom/xmldom";
import fs from "fs";
import { xmlToComplexHtml } from "@/data/xmlToComplexHtml";

export class TextEditor {
  private readonly bookXml: string;

  constructor(private readonly bookSlug: BOOK_SLUGS) {
    this.bookSlug = bookSlug;
    this.bookXml = this.getBookXml();
  }

  private getBookXml() {
    return fs.readFileSync(`./src/data/${this.bookSlug}-chapters.xml`, "utf8");
  }

  private regenerateXml(xmlString: string) {
    const htmlString = xmlToComplexHtml(xmlString, this.bookSlug);
    fs.writeFileSync(`./src/data/chapters-${this.bookSlug}.ts`, `export const ${this.bookSlug.replace(/-/g, "")}BookXml = \`<section>${htmlString}</section>\`;`);
  }

  public addCharacter(chapterNumber: number, paragraphNumber: number, updatedParagraphText: string) {
    const paragraphText = this.getParagraphByNumber(chapterNumber, paragraphNumber);
    const updatedXml = this.bookXml.replace(paragraphText, updatedParagraphText);
    this.regenerateXml(updatedXml);
    fs.writeFileSync(`./src/data/${this.bookSlug}-chapters.xml`, updatedXml, "utf-8");
    return updatedXml;
  }

  public getParagraphByNumber(chapterNumber: number, paragraphNumber: number): string | null {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(this.bookXml, "text/xml");

    const chapters = xmlDoc.getElementsByTagName("Chapter");

    if (chapterNumber <= 0 || chapterNumber > chapters.length) {
      return null;
    }

    const chapter = chapters[chapterNumber - 1];
    const paragraphs = Array.from(chapter.childNodes).filter((node) => node.nodeType === 1);

    if (paragraphNumber < 0 || paragraphNumber >= paragraphs.length) {
      return null;
    }

    const paragraph = paragraphs[paragraphNumber];
    return paragraph.toString();
  }
}

if (require.main === module) {
  (async () => {
    const BOOK_SLUG = BOOK_SLUGS.Krolowa_Sniegu;

    const textEditor = new TextEditor(BOOK_SLUG);

    textEditor.addCharacter(3, 5, `<p><Gerda talking="true"/>— <Kaj>Kaj</Kaj> nie żyje! — rzekła do niego Gerda.</p>`);
  })();
}
