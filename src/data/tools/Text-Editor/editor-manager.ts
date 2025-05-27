import { spawn, spawnSync } from "child_process";
import * as path from "path";
import * as os from "os";
import fs from "fs";

export class EditorManager {
  public static async openInCursor(content: string): Promise<string> {
    this.verifyCursorInstallation();

    return new Promise((resolve, reject) => {
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `temp-${Date.now()}.xml`);

      fs.writeFileSync(tempFile, content);

      const vscode = spawn("cursor", ["--wait", tempFile], { stdio: "inherit" });

      vscode.on("close", (code) => {
        if (code === 0) {
          try {
            const modifiedContent = fs.readFileSync(tempFile, "utf-8");
            fs.unlinkSync(tempFile);
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

  private static verifyCursorInstallation(): void {
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
