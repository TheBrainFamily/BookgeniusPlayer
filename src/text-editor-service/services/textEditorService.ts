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
}
