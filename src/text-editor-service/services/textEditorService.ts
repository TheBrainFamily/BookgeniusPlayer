import { TextEditor } from "../../../scripts/data/tools/Text-Editor/text-editor";
import { bookDataLoader } from "@/services/bookDataLoader";
import * as fs from "fs/promises";
import * as path from "path";

export class TextEditorService {
  private textEditor: TextEditor = new TextEditor(bookDataLoader.getCurrentBook());

  public editParagraph(chapterNumber: number, paragraphNumber: number) {
    return this.textEditor.editParagraph(chapterNumber, paragraphNumber);
  }

  public removeCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, occurrenceNumber: number) {
    return this.textEditor.removeCharacter(chapterNumber, paragraphNumber, characterName, occurrenceNumber);
  }

  public addCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, selectedText: string, startSelectedWordIndex: number, endSelectedWordIndex: number) {
    return this.textEditor.addCharacter(chapterNumber, paragraphNumber, characterName, selectedText, startSelectedWordIndex, endSelectedWordIndex);
  }

  public addMusicSuggestion(chapterNumber: number, paragraphNumber: number) {
    return this.textEditor.addMusicSuggestion(chapterNumber, paragraphNumber);
  }

  public removeMusicSuggestion(chapterNumber: number, paragraphNumber: number) {
    return this.textEditor.removeMusicSuggestion(chapterNumber, paragraphNumber);
  }

  public addBackgroundSuggestion(chapterNumber: number, paragraphNumber: number) {
    return this.textEditor.addBackgroundSuggestion(chapterNumber, paragraphNumber);
  }

  public removeBackgroundSuggestion(chapterNumber: number, paragraphNumber: number) {
    return this.textEditor.removeBackgroundSuggestion(chapterNumber, paragraphNumber);
  }

  public async saveFile(bookName: string, fileName: string, content: string): Promise<{ success: boolean; message: string }> {
    try {
      // Determine the correct file path
      const isBookFile = fileName === "book.xml";
      const filePath = isBookFile
        ? path.join(process.cwd(), "public", "books", bookName, "book.xml")
        : path.join(process.cwd(), "public", "books", bookName, "booksContent", fileName);

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write the file
      await fs.writeFile(filePath, content, "utf8");

      console.log(`✅ Successfully saved ${fileName} for book ${bookName}`);
      return { success: true, message: `File ${fileName} saved successfully` };
    } catch (error) {
      console.error(`❌ Failed to save ${fileName} for book ${bookName}:`, error);
      throw new Error(`Failed to save file: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}
