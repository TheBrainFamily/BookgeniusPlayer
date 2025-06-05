import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { EditorError, CursorInstallationError, SettingsError } from "./error-handlers";

const SETTINGS = { VSCODE_SETTINGS_FILE: ".vscode/settings.json", TEMP_FILE_DIR: "./src/data/tools/Text-Editor", DEFAULT_SETTINGS: { "editor.wordWrap": "on" } } as const;

export class EditorManager {
  private userCursorSettings: string | null = null;

  public async openInCursor(content: string): Promise<string> {
    try {
      this.verifyCursorInstallation();
      this.adjustSettings();

      if (!fs.existsSync(SETTINGS.TEMP_FILE_DIR)) {
        fs.mkdirSync(SETTINGS.TEMP_FILE_DIR);
      }

      const tempFile = path.join(SETTINGS.TEMP_FILE_DIR, `temp-${Date.now()}.xml`);

      return await this.editContentInCursor(content, tempFile);
    } catch (error) {
      throw new EditorError(`Failed to open in Cursor: ${error.message}`);
    }
  }

  public adjustSettings(): void {
    try {
      this.ensureVSCodeDirectory();
      this.updateSettings();
    } catch (error) {
      throw new SettingsError(`Failed to adjust settings: ${error.message}`);
    }
  }

  public restoreSettings(): void {
    try {
      if (!this.userCursorSettings) {
        fs.rmSync(SETTINGS.VSCODE_SETTINGS_FILE);
        return;
      }

      fs.writeFileSync(SETTINGS.VSCODE_SETTINGS_FILE, this.userCursorSettings);
      this.userCursorSettings = null;
    } catch (error) {
      throw new SettingsError(`Failed to restore settings: ${error.message}`);
    }
  }

  private ensureVSCodeDirectory(): void {
    if (!fs.existsSync(".vscode")) {
      fs.mkdirSync(".vscode");
    }
  }

  private updateSettings(): void {
    if (!fs.existsSync(SETTINGS.VSCODE_SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS.VSCODE_SETTINGS_FILE, JSON.stringify(SETTINGS.DEFAULT_SETTINGS, null, 2));
      return;
    }

    this.userCursorSettings = fs.readFileSync(SETTINGS.VSCODE_SETTINGS_FILE, "utf-8");
    const settingsJson = JSON.parse(this.userCursorSettings);
    settingsJson["editor.wordWrap"] = "on";
    fs.writeFileSync(SETTINGS.VSCODE_SETTINGS_FILE, JSON.stringify(settingsJson, null, 2));
  }

  private async editContentInCursor(content: string, tempFile: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        fs.writeFileSync(tempFile, content);
        const vscode = spawn("cursor", ["--wait", tempFile], { stdio: "inherit" });

        vscode.on("close", (code) => {
          if (code === 0) {
            try {
              const modifiedContent = fs.readFileSync(tempFile, "utf-8");
              fs.unlinkSync(tempFile);
              this.restoreSettings();
              resolve(modifiedContent);
            } catch (error) {
              reject(new EditorError(`Failed to read modified content: ${error.message}`));
            }
          } else {
            reject(new EditorError(`Cursor exited with code ${code}`));
          }
        });

        vscode.on("error", (error) => {
          reject(new EditorError(`Failed to start Cursor: ${error.message}`));
        });
      } catch (error) {
        reject(new EditorError(`Failed to create temporary file: ${error.message}`));
      }
    });
  }

  private verifyCursorInstallation(): void {
    try {
      const vscodeVersion = spawnSync("cursor", ["--version"], { stdio: "pipe" });
      if (vscodeVersion.status !== 0) {
        throw new CursorInstallationError("Cursor is not installed or not in PATH");
      }
    } catch {
      throw new CursorInstallationError("Cursor is not installed or not in PATH. Please install Cursor to use this feature.");
    }
  }
}
