import { spawn, spawnSync } from "child_process";
import fs from "fs";

export class EditorManager {
  private userCursorSettings: string = null;
  private readonly vsCodeSettingsFile: string = ".vscode/settings.json";

  public async openInCursor(content: string): Promise<string> {
    this.verifyCursorInstallation();
    this.adjustSettings();

    return new Promise((resolve, reject) => {
      const tempFile = `./src/data/tools/Text-Editor/temp-${Date.now()}.xml`;
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
            reject(error);
          }
        } else {
          reject(new Error(`Cursor exited with code ${code}`));
        }
      });

      vscode.on("error", (error) => {
        reject(error);
      });
    });
  }

  public adjustSettings(): void {
    if (!fs.existsSync(this.vsCodeSettingsFile)) {
      return fs.writeFileSync(this.vsCodeSettingsFile, '{ "editor.wordWrap": "on" }');
    }

    this.userCursorSettings = fs.readFileSync(this.vsCodeSettingsFile, "utf-8");
    const settingsJson = JSON.parse(this.userCursorSettings);
    settingsJson["editor.wordWrap"] = "on";
    fs.writeFileSync(this.vsCodeSettingsFile, JSON.stringify(settingsJson, null, 2));
  }

  public restoreSettings(): void {
    if (!this.userCursorSettings) {
      fs.rmSync(this.vsCodeSettingsFile);
      return;
    }
    fs.writeFileSync(this.vsCodeSettingsFile, this.userCursorSettings);
    this.userCursorSettings = null;
  }

  private verifyCursorInstallation(): void {
    try {
      const vscodeVersion = spawnSync("cursor", ["--version"], { stdio: "pipe" });
      if (vscodeVersion.status !== 0) {
        throw new Error("Cursor is not installed or not in PATH");
      }
    } catch {
      throw new Error("Cursor is not installed or not in PATH. Please install Cursor to use this feature.");
    }
  }
}
