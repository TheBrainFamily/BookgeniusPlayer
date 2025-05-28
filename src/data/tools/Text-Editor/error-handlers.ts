export class EditorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorError";
  }
}

export class CursorInstallationError extends EditorError {
  constructor(message: string) {
    super(message);
    this.name = "CursorInstallationError";
  }
}

export class SettingsError extends EditorError {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}
