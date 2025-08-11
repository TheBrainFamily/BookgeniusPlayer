import { TextEditor } from "../../../scripts/data/tools/Text-Editor/text-editor";

export class TextEditorService {
  private textEditor: TextEditor = new TextEditor();

  public removeCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, occurrenceNumber: number, bookName: string) {
    return this.textEditor.removeCharacter(chapterNumber, paragraphNumber, characterName, occurrenceNumber, bookName);
  }
}
