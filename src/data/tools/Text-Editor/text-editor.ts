import { BOOK_SLUGS } from "@/consts";
import { XmlManager } from "./xml-manager";
import { FileManager } from "./file-manager";
import { EditorManager } from "./editor-manager";
import { extractWords } from "@/utils/extractWords";
import { PromptsManager } from "@/data/tools/Text-Editor/prompts-manager";

export class TextEditor {
  private readonly fileManager: FileManager;
  private readonly editorManager: EditorManager;
  private readonly promptsManager: PromptsManager;
  private readonly xmlManager: XmlManager;

  constructor(private readonly bookSlug: BOOK_SLUGS) {
    this.editorManager = new EditorManager();
    this.fileManager = new FileManager(bookSlug);
    this.promptsManager = new PromptsManager(bookSlug);
    this.xmlManager = new XmlManager();
  }

  public getParagraphByNumber(chapterNumber: number, paragraphNumber: number): string | null {
    const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
    const chapter = this.xmlManager.getChapter(xmlDoc, chapterNumber);

    if (!chapter) {
      return null;
    }

    const paragraphs = this.xmlManager.getParagraphs(chapter);
    if (paragraphNumber < 0 || paragraphNumber >= paragraphs.length) {
      return null;
    }

    return this.xmlManager.getParagraphText(paragraphs[paragraphNumber]);
  }

  public async editParagraph(chapterNumber: number, paragraphNumber: number): Promise<void> {
    const originalParagraph = this.getParagraphByNumber(chapterNumber, paragraphNumber);
    if (!originalParagraph) {
      throw new Error("Paragraph not found");
    }

    this.promptsManager.generateWrapCharactersRule();
    const updatedParagraphText = await this.editorManager.openInCursor(originalParagraph);
    const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
    const chapter = this.xmlManager.getChapter(xmlDoc, chapterNumber);
    const paragraphs = this.xmlManager.getParagraphs(chapter!);
    this.xmlManager.updateParagraphContent(xmlDoc, paragraphs[paragraphNumber], updatedParagraphText);

    const updatedXml = this.xmlManager.serializeXml(xmlDoc);
    this.fileManager.regenerateXml(updatedXml);
  }

  public addCharacter(
    chapterNumber: number,
    paragraphNumber: number,
    characterName: string,
    selectedText: string,
    startSelectedWordIndex: number,
    endSelectedWordIndex: number,
  ): string {
    const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
    const chapter = this.xmlManager.getChapter(xmlDoc, chapterNumber);

    if (!chapter) {
      throw new Error("Chapter not found");
    }

    const paragraphs = this.xmlManager.getParagraphs(chapter);
    if (paragraphNumber < 0 || paragraphNumber >= paragraphs.length) {
      throw new Error("Paragraph not found");
    }

    const paragraph = paragraphs[paragraphNumber];
    const paragraphText = this.xmlManager.getParagraphText(paragraph);
    const characterTag = `<${characterName}>${selectedText}</${characterName}>`;

    const words = extractWords(paragraphText, "xml");

    const updatedWords = [...words.slice(0, startSelectedWordIndex), characterTag, ...words.slice(endSelectedWordIndex + 1)];

    const updatedParagraphText = updatedWords
      .join(" ")
      .replace(/\s+(<note id="\d+"\/>)/g, "$1")
      .replace(/\s+([.,!?;:])/g, "$1");
    this.xmlManager.updateParagraphContent(xmlDoc, paragraph, updatedParagraphText);

    const updatedXml = this.xmlManager.serializeXml(xmlDoc);
    this.fileManager.regenerateXml(updatedXml);
    return updatedXml;
  }

  public removeCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, occurrence: number = 1): string {
    const originalParagraph = this.getParagraphByNumber(chapterNumber, paragraphNumber);
    if (!originalParagraph) {
      throw new Error("Paragraph not found");
    }

    const characterPattern = new RegExp(`<${characterName}[^>]*>.*?</${characterName}>`, "g");
    const matches = originalParagraph.match(characterPattern) || [];

    if (occurrence < 1 || occurrence > matches.length) {
      throw new Error(`Invalid occurrence number. There are ${matches.length} occurrences of ${characterName} in this paragraph.`);
    }

    let currentOccurrence = 0;
    const updatedParagraph = originalParagraph.replace(characterPattern, (match) => {
      currentOccurrence++;
      if (currentOccurrence === occurrence) {
        return match.replace(new RegExp(`<${characterName}[^>]*>|</${characterName}>`, "g"), "");
      }
      return match;
    });

    const remainingMatches = updatedParagraph.match(characterPattern) || [];
    if (remainingMatches.length !== matches.length - 1) {
      throw new Error("Failed to remove character tag properly");
    }

    const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
    const chapter = this.xmlManager.getChapter(xmlDoc, chapterNumber);
    const paragraphs = this.xmlManager.getParagraphs(chapter!);
    this.xmlManager.updateParagraphContent(xmlDoc, paragraphs[paragraphNumber], updatedParagraph);

    const updatedXml = this.xmlManager.serializeXml(xmlDoc);
    this.fileManager.regenerateXml(updatedXml);
    return updatedXml;
  }
}

if (require.main === module) {
  (async () => {
    // const BOOK_SLUG = BOOK_SLUGS.Krolowa_Sniegu;
    // const textEditor = new TextEditor(BOOK_SLUG);
    // textEditor.addCharacter(3, 5, `<p><Gerda talking="true"/>— <Kaj>Kaj</Kaj> nie żyje! — rzekła do niego Gerda.</p>`);
    // textEditor.handleRemoveCharacter(1, 1, "Kaj", 1);
  })();
}
