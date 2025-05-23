import { TextEditor } from "@/data/tools/Text-Editor/text-editor";
import { BOOK_SLUGS } from "@/consts";

export class TextEditorService {
  private textEditor: TextEditor;

  constructor(bookSlug: BOOK_SLUGS) {
    this.textEditor = new TextEditor(bookSlug);
  }

  public editParagraph(chapterNumber: number, paragraphNumber: number) {
    return this.textEditor.editParagraph(chapterNumber, paragraphNumber);
  }

  public removeCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, occurrenceNumber: number) {
    return this.textEditor.removeCharacter(chapterNumber, paragraphNumber, characterName, occurrenceNumber);
  }

  public addCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, word: string, wordIndex: number) {
    return this.textEditor.addCharacter(chapterNumber, paragraphNumber, characterName, word, wordIndex);
  }

  // public addCharacter(chapterNumber: number, paragraphNumber: number, updatedParagraphText: string) {
  //   return this.textEditor.addCharacter(chapterNumber, paragraphNumber, updatedParagraphText);
  // }
  //
  // public getParagraphByNumber(chapterNumber: number, paragraphNumber: number) {
  //   return this.textEditor.getParagraphByNumber(chapterNumber, paragraphNumber);
  // }
  //
  // public handleRemoveCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, occurrence: number = 1) {
  //   return this.textEditor.handleRemoveCharacter(chapterNumber, paragraphNumber, characterName, occurrence);
  // }
}
