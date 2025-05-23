import { TextEditor } from "@/data/tools/Text-Editor/text-editor";
import { BOOK_SLUGS } from "@/consts";

export class TextEditorService {
  private textEditor: TextEditor;

  constructor(bookSlug: BOOK_SLUGS) {
    this.textEditor = new TextEditor(bookSlug);
  }

  public addCharacter(chapterNumber: number, paragraphNumber: number, updatedParagraphText: string) {
    return this.textEditor.addCharacter(chapterNumber, paragraphNumber, updatedParagraphText);
  }

  public getParagraphByNumber(chapterNumber: number, paragraphNumber: number) {
    return this.textEditor.getParagraphByNumber(chapterNumber, paragraphNumber);
  }

  public removeCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, occurrence: number = 1) {
    return this.textEditor.removeCharacter(chapterNumber, paragraphNumber, characterName, occurrence);
  }
}
