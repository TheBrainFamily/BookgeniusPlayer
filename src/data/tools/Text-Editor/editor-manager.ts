import { spawn, spawnSync } from "child_process";
import fs from "fs";

export class EditorManager {
  private userCursorSettings: string = null;
  private readonly vsCodeSettingsFile: string = ".vscode/settings.json";

  public async openInCursor(content: string): Promise<string> {
    try {
      this.verifyCursorInstallation();
      this.adjustSettings();

      return new Promise((resolve, reject) => {
        const tempFile = `./src/data/tools/Text-Editor/temp-${Date.now()}.xml`;
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
                reject(new Error(`Failed to read modified content: ${error.message}`));
              }
            } else {
              reject(new Error(`Cursor exited with code ${code}`));
            }
          });

          vscode.on("error", (error) => {
            reject(new Error(`Failed to start Cursor: ${error.message}`));
          });
        } catch (error) {
          reject(new Error(`Failed to create temporary file: ${error.message}`));
        }
      });
    } catch (error) {
      console.error("Error in openInCursor:", error);
      throw new Error(`Failed to open in Cursor: ${error.message}`);
    }
  }

  public adjustSettings(): void {
    try {
      if (!fs.existsSync(this.vsCodeSettingsFile)) {
        if (!fs.existsSync(".vscode")) {
          fs.mkdirSync(".vscode");
        }
        return fs.writeFileSync(this.vsCodeSettingsFile, '{ "editor.wordWrap": "on" }');
      }

      this.userCursorSettings = fs.readFileSync(this.vsCodeSettingsFile, "utf-8");
      const settingsJson = JSON.parse(this.userCursorSettings);
      settingsJson["editor.wordWrap"] = "on";
      fs.writeFileSync(this.vsCodeSettingsFile, JSON.stringify(settingsJson, null, 2));
    } catch (error) {
      console.error("Error adjusting settings:", error);
      throw new Error(`Failed to adjust settings: ${error.message}`);
    }
  }

  public restoreSettings(): void {
    try {
      if (!this.userCursorSettings) {
        fs.rmSync(this.vsCodeSettingsFile);
        return;
      }
      fs.writeFileSync(this.vsCodeSettingsFile, this.userCursorSettings);
      this.userCursorSettings = null;
    } catch (error) {
      console.error("Error restoring settings:", error);
      throw new Error(`Failed to restore settings: ${error.message}`);
    }
  }

  private verifyCursorInstallation(): void {
    try {
      const vscodeVersion = spawnSync("cursor", ["--version"], { stdio: "pipe" });
      if (vscodeVersion.status !== 0) {
        throw new Error("Cursor is not installed or not in PATH");
      }
    } catch (error) {
      console.error("Error verifying Cursor installation:", error);
      throw new Error("Cursor is not installed or not in PATH. Please install Cursor to use this feature.");
    }
  }
}
