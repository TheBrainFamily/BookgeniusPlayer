import { BOOK_SLUGS } from "@/consts";
import { XmlManager } from "./xml-manager";
import { FileManager } from "./file-manager";
import { EditorManager } from "./editor-manager";
import { PromptsManager } from "@/data/tools/Text-Editor/prompts-manager";
import { joinParsedText, parseHtmlText } from "@/utils/parseHtmlText";
import { TextEditorError, ParagraphNotFoundError, CharacterNotFoundError } from "./error-handlers";

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

  private handleError(operation: string, error: Error): never {
    console.error(`Error in ${operation}:`, error);
    throw new TextEditorError(`Failed to ${operation}: ${error.message}`);
  }

  public getParagraphByNumber(chapterNumber: number, paragraphNumber: number): string | null {
    try {
      const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
      const { paragraph } = this.xmlManager.getParagraphElement(xmlDoc, chapterNumber, paragraphNumber);
      return paragraph ? this.xmlManager.getParagraphText(paragraph) : null;
    } catch (error) {
      this.handleError("get paragraph", error);
    }
  }

  public async editParagraph(chapterNumber: number, paragraphNumber: number): Promise<void> {
    try {
      const originalParagraph = this.getParagraphByNumber(chapterNumber, paragraphNumber);
      if (!originalParagraph) {
        throw new ParagraphNotFoundError(chapterNumber, paragraphNumber);
      }

      this.promptsManager.generateWrapCharactersRule();
      const updatedParagraphText = await this.editorManager.openInCursor(originalParagraph);

      const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
      const { paragraph } = this.xmlManager.getParagraphElement(xmlDoc, chapterNumber, paragraphNumber);
      if (!paragraph) {
        throw new ParagraphNotFoundError(chapterNumber, paragraphNumber);
      }

      const updatedXml = this.xmlManager.updateAndSaveXml(xmlDoc, paragraph, updatedParagraphText);
      this.fileManager.regenerateXml(updatedXml);
      this.promptsManager.removeWrapCharactersRule();
    } catch (error) {
      this.handleError("edit paragraph", error);
    }
  }

  public addCharacter(
    chapterNumber: number,
    paragraphNumber: number,
    characterName: string,
    selectedText: string,
    startSelectedWordIndex: number,
    endSelectedWordIndex: number,
  ): string {
    try {
      const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
      const { paragraph } = this.xmlManager.getParagraphElement(xmlDoc, chapterNumber, paragraphNumber);
      if (!paragraph) {
        throw new ParagraphNotFoundError(chapterNumber, paragraphNumber);
      }

      const paragraphText = this.xmlManager.getParagraphText(paragraph);
      const characterTag = `<${characterName}>${selectedText}</${characterName}>`;
      const words = parseHtmlText(paragraphText.trim());

      const updatedWords = [...words.slice(0, startSelectedWordIndex), { text: characterTag, whitespace: " " }, ...words.slice(endSelectedWordIndex + 1)];

      const updatedXml = this.xmlManager.updateAndSaveXml(xmlDoc, paragraph, joinParsedText(updatedWords));
      this.fileManager.regenerateXml(updatedXml);
      return updatedXml;
    } catch (error) {
      this.handleError("add character", error);
    }
  }

  public removeCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, occurrence: number = 1): string {
    try {
      const originalParagraph = this.getParagraphByNumber(chapterNumber, paragraphNumber);
      if (!originalParagraph) {
        throw new ParagraphNotFoundError(chapterNumber, paragraphNumber);
      }

      const characterPattern = new RegExp(`<${characterName}[^>]*>.*?</${characterName}>`, "g");
      const matches = originalParagraph.match(characterPattern) || [];

      if (occurrence < 1 || occurrence > matches.length) {
        throw new CharacterNotFoundError(characterName, occurrence, matches.length);
      }

      let currentOccurrence = 0;
      const updatedParagraph = originalParagraph.replace(characterPattern, (match) => {
        currentOccurrence++;
        return currentOccurrence === occurrence ? match.replace(new RegExp(`<${characterName}[^>]*>|</${characterName}>`, "g"), "") : match;
      });

      const remainingMatches = updatedParagraph.match(characterPattern) || [];
      if (remainingMatches.length !== matches.length - 1) {
        throw new TextEditorError("Failed to remove character tag properly");
      }

      const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
      const { paragraph } = this.xmlManager.getParagraphElement(xmlDoc, chapterNumber, paragraphNumber);
      if (!paragraph) {
        throw new ParagraphNotFoundError(chapterNumber, paragraphNumber);
      }

      const updatedXml = this.xmlManager.updateAndSaveXml(xmlDoc, paragraph, updatedParagraph);
      this.fileManager.regenerateXml(updatedXml);
      return updatedXml;
    } catch (error) {
      this.handleError("remove character", error);
    }
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
