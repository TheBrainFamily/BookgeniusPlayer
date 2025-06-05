import { XmlManager } from "./xml-manager";
import { FileManager, IFileManager, MockFileManager } from "./file-manager";
import { EditorManager } from "./editor-manager";
import { PromptsManager } from "./prompts-manager";
import { joinParsedText, parseHtmlText } from "@/utils/parseHtmlText";
import { TextEditorError, ParagraphNotFoundError, CharacterNotFoundError } from "./error-handlers";
import { BOOK_SLUGS } from "@/consts";

export class TextEditor {
  private readonly fileManager: IFileManager;
  private readonly xmlManager: XmlManager;
  private readonly editorManager: EditorManager;
  private readonly promptsManager: PromptsManager;

  constructor(
    private readonly bookSlug: BOOK_SLUGS,
    private readonly environment: string = "development",
  ) {
    this.environment = environment;
    this.bookSlug = bookSlug;
    this.fileManager = this.environment === "development" ? new FileManager(this.bookSlug) : new MockFileManager();
    this.xmlManager = new XmlManager();
    this.editorManager = new EditorManager();
    this.promptsManager = new PromptsManager(this.bookSlug, this.xmlManager);
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
      const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
      const { paragraph } = this.xmlManager.getParagraphElement(xmlDoc, chapterNumber, paragraphNumber);
      const originalParagraph = this.xmlManager.getParagraphHtml(paragraph);

      this.promptsManager.generateWrapCharactersRule();
      const updatedParagraph = await this.editorManager.openInCursor(originalParagraph);
      const updatedParagraphElement = this.xmlManager.stringToElement(updatedParagraph);
      const updatedParagraphText = this.xmlManager.getParagraphText(updatedParagraphElement);

      if (updatedParagraph !== originalParagraph) {
        const updatedXml = this.xmlManager.updateAndSaveXml(xmlDoc, paragraph, updatedParagraphText);
        this.fileManager.regenerateXml(updatedXml);
      }

      this.promptsManager.removeWrapCharactersRule();
    } catch (error) {
      this.handleError("edit paragraph", error);
    }
  }

  public async addMusicSuggestion(chapterNumber: number, paragraphNumber: number): Promise<void> {
    try {
      const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
      const { paragraph } = this.xmlManager.getParagraphElement(xmlDoc, chapterNumber, paragraphNumber);
      const originalParagraph = this.xmlManager.getParagraphHtml(paragraph);

      this.promptsManager.generateMusicSuggestionRule();
      const updatedParagraph = await this.editorManager.openInCursor(originalParagraph);
      const updatedParagraphElement = this.xmlManager.stringToElement(updatedParagraph);
      const updatedParagraphText = this.xmlManager.getParagraphText(updatedParagraphElement);

      if (updatedParagraph !== originalParagraph) {
        const updatedXml = this.xmlManager.updateAndSaveXml(xmlDoc, paragraph, updatedParagraphText);
        this.fileManager.regenerateXml(updatedXml);
      }

      this.promptsManager.removeMusicSuggestionRule();
    } catch (error) {
      this.handleError("add music shift suggestion to paragraph", error);
    }
  }

  public async addBackgroundSuggestion(chapterNumber: number, paragraphNumber: number): Promise<void> {
    try {
      const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
      const { paragraph } = this.xmlManager.getParagraphElement(xmlDoc, chapterNumber, paragraphNumber);
      const originalParagraph = this.xmlManager.getParagraphHtml(paragraph);

      this.promptsManager.generateBackgroundSuggestionRule();
      const updatedParagraph = await this.editorManager.openInCursor(originalParagraph);
      const updatedParagraphElement = this.xmlManager.stringToElement(updatedParagraph);
      const updatedParagraphText = this.xmlManager.getParagraphText(updatedParagraphElement);

      if (updatedParagraph !== originalParagraph) {
        const updatedXml = this.xmlManager.updateAndSaveXml(xmlDoc, paragraph, updatedParagraphText);
        this.fileManager.regenerateXml(updatedXml);
      }

      this.promptsManager.removeBackgroundSuggestionRule();
    } catch (error) {
      this.handleError("add background shift suggestion to paragraph", error);
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

  public removeMusicSuggestion(chapterNumber: number, paragraphNumber: number): string {
    const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
    const { paragraph } = this.xmlManager.getParagraphElement(xmlDoc, chapterNumber, paragraphNumber);
    if (!paragraph) {
      throw new ParagraphNotFoundError(chapterNumber, paragraphNumber);
    }

    const paragraphText = this.xmlManager.getParagraphText(paragraph);
    const updatedParagraph = paragraphText.replace(/<musicShift[^>]*>.*?<\/musicShift>|<musicShift[^>]*\/>/g, "");

    const updatedXml = this.xmlManager.updateAndSaveXml(xmlDoc, paragraph, updatedParagraph);
    this.fileManager.regenerateXml(updatedXml);
    return updatedXml;
  }

  public removeBackgroundSuggestion(chapterNumber: number, paragraphNumber: number): string {
    const xmlDoc = this.xmlManager.parseXml(this.fileManager.readXmlFile());
    const { paragraph } = this.xmlManager.getParagraphElement(xmlDoc, chapterNumber, paragraphNumber);
    if (!paragraph) {
      throw new ParagraphNotFoundError(chapterNumber, paragraphNumber);
    }

    const paragraphText = this.xmlManager.getParagraphText(paragraph);
    const updatedParagraph = paragraphText.replace(/<backgroundShift[^>]*>.*?<\/backgroundShift>|<backgroundShift[^>]*\/>/g, "");

    const updatedXml = this.xmlManager.updateAndSaveXml(xmlDoc, paragraph, updatedParagraph);
    this.fileManager.regenerateXml(updatedXml);
    return updatedXml;
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
