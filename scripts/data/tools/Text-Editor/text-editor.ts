import { TextEditorError, ParagraphNotFoundError, CharacterNotFoundError } from "./error-handlers";
import { BooksService } from "@/text-editor-service/services/booksService";
import { getParagraphById } from "@/text-editor-service/utils/getParagraphById";

export class TextEditor {
  private readonly booksService: BooksService;

  constructor() {
    this.booksService = new BooksService();
  }

  private handleError(operation: string, error: Error): never {
    console.error(`Error in ${operation}:`, error);
    throw new TextEditorError(`Failed to ${operation}: ${error.message}`);
  }

  public async removeCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, occurrence: number = 1, bookName: string): Promise<void> {
    try {
      const { chapters } = await this.booksService.getBookData(bookName);

      const chapterContent = chapters[`chapter${chapterNumber}`];
      const paragraph = getParagraphById(paragraphNumber, chapterContent);

      if (!paragraph) {
        throw new ParagraphNotFoundError(chapterNumber, paragraphNumber);
      }

      const characterPattern = new RegExp(`<${characterName}[^>]*>.*?</${characterName}>`, "g");

      const matches = paragraph.match(characterPattern) || [];

      if (occurrence < 1 || occurrence > matches.length) {
        throw new CharacterNotFoundError(characterName, occurrence, matches.length);
      }

      let currentOccurrence = 0;
      const updatedParagraph = paragraph.replace(characterPattern, (match) => {
        currentOccurrence++;
        return currentOccurrence === occurrence ? match.replace(new RegExp(`<${characterName}[^>]*>|</${characterName}>`, "g"), "") : match;
      });

      const remainingMatches = updatedParagraph.match(characterPattern) || [];
      if (remainingMatches.length !== matches.length - 1) {
        throw new TextEditorError("Failed to remove character tag properly");
      }

      const updatedChapterContent = chapterContent.replace(paragraph, updatedParagraph);

      await this.booksService.updateChapter(bookName, `chapter${chapterNumber}`, updatedChapterContent);
    } catch (error) {
      this.handleError("remvoe character", error);
    }
  }
}
