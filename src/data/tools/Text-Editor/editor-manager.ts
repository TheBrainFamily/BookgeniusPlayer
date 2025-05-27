import { spawn, spawnSync } from "child_process";
import * as path from "path";
import * as os from "os";
import fs from "fs";

export class EditorManager {
  public static async openInVSCode(content: string): Promise<string> {
    this.verifyVSCodeInstallation();

    return new Promise((resolve, reject) => {
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `temp-${Date.now()}.xml`);

      fs.writeFileSync(tempFile, content);

      const vscode = spawn("code", ["--wait", tempFile], { stdio: "inherit" });

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
          reject(new Error(`VS Code exited with code ${code}`));
        }
      });

      vscode.on("error", (error) => {
        reject(error);
      });
    });
  }

  private static verifyVSCodeInstallation(): void {
    try {
      const vscodeVersion = spawnSync("code", ["--version"], { stdio: "pipe" });
      if (vscodeVersion.status !== 0) {
        throw new Error("VS Code is not installed or not in PATH");
      }
    } catch {
      throw new Error("VS Code is not installed or not in PATH. Please install VS Code to use this feature.");
    }
  }
}
