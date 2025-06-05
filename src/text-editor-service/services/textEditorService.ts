import { CURRENT_BOOK } from "@/consts";
import { TextEditor } from "@/text-editor-service/Text-Editor/text-editor";

export class TextEditorService {
  private textEditor: TextEditor = new TextEditor(CURRENT_BOOK);

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
