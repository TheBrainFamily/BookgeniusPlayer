export class TextEditorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextEditorError";
  }
}

export class XmlError extends TextEditorError {
  constructor(message: string) {
    super(message);
    this.name = "XmlError";
  }
}

export class FileError extends TextEditorError {
  constructor(message: string) {
    super(message);
    this.name = "FileError";
  }
}

export class EditorError extends TextEditorError {
  constructor(message: string) {
    super(message);
    this.name = "EditorError";
  }
}

export class SettingsError extends TextEditorError {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

export class CursorInstallationError extends TextEditorError {
  constructor(message: string) {
    super(message);
    this.name = "CursorInstallationError";
  }
}

export class ParagraphNotFoundError extends TextEditorError {
  constructor(chapterNumber: number, paragraphNumber: number) {
    super(`Paragraph not found at chapter ${chapterNumber}, paragraph ${paragraphNumber}`);
    this.name = "ParagraphNotFoundError";
  }
}

export class CharacterNotFoundError extends TextEditorError {
  constructor(characterName: string, occurrence: number, totalOccurrences: number) {
    super(`Invalid occurrence number ${occurrence}. There are ${totalOccurrences} occurrences of ${characterName} in this paragraph.`);
    this.name = "CharacterNotFoundError";
  }
}
