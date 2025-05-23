import { BOOK_SLUGS } from "@/consts";
import { DOMParser } from "@xmldom/xmldom";
import fs from "fs";
import { xmlToComplexHtml } from "@/data/xmlToComplexHtml";
import { spawn, spawnSync } from "child_process";
import * as path from "path";
import * as os from "os";

export class TextEditor {
  constructor(private readonly bookSlug: BOOK_SLUGS) {
    this.bookSlug = bookSlug;
  }

  private getBookXml(): string {
    return fs.readFileSync(`./src/data/${this.bookSlug}-chapters.xml`, "utf8");
  }

  public regenerateXml(xmlString: string) {
    const htmlString = xmlToComplexHtml(xmlString, this.bookSlug);
    fs.writeFileSync(`./src/data/chapters-${this.bookSlug}.ts`, `export const ${this.bookSlug.replace(/-/g, "")}BookXml = \`<section>${htmlString}</section>\`;`);
  }

  public getParagraphByNumber(chapterNumber: number, paragraphNumber: number): string | null {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(this.getBookXml(), "text/xml");

    const chapters = xmlDoc.getElementsByTagName("Chapter");

    if (chapterNumber <= 0 || chapterNumber > chapters.length) {
      return null;
    }

    const chapter = chapters[chapterNumber - 1];
    const paragraphs = Array.from(chapter.childNodes).filter((node) => node.nodeType === 1);

    if (paragraphNumber < 0 || paragraphNumber >= paragraphs.length) {
      return null;
    }

    const paragraph = paragraphs[paragraphNumber];
    return paragraph.toString();
  }

  public async editParagraph(chapterNumber: number, paragraphNumber: number): Promise<void> {
    const originalParagraph = this.getParagraphByNumber(chapterNumber, paragraphNumber);

    if (!originalParagraph) {
      throw new Error("Paragraph not found");
    }

    const updatedParagraphText = await this.openParagraphInVSCode(originalParagraph);

    console.log("53: updatedParagraphText BANG!", updatedParagraphText);

    const updatedXml = this.getBookXml().replace(originalParagraph, updatedParagraphText);

    console.log("57: updatedXml BANG!", updatedXml);

    fs.writeFileSync(`./src/data/${this.bookSlug}-chapters.xml`, updatedXml, "utf-8");
    this.regenerateXml(updatedXml);
  }

  public removeCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, occurrence: number = 1): string {
    const originalParagraph = this.getParagraphByNumber(chapterNumber, paragraphNumber);

    if (!originalParagraph) {
      throw new Error("Paragraph not found");
    }

    // Create a regex pattern to match the character tag with the specified name
    const characterPattern = new RegExp(`<${characterName}[^>]*>.*?</${characterName}>`, "g");

    // Count total occurrences
    const matches = originalParagraph.match(characterPattern) || [];
    if (occurrence < 1 || occurrence > matches.length) {
      throw new Error(`Invalid occurrence number. There are ${matches.length} occurrences of ${characterName} in this paragraph.`);
    }

    // Remove the specific occurrence of the character tag while preserving the content inside
    let currentOccurrence = 0;
    const updatedParagraph = originalParagraph.replace(characterPattern, (match) => {
      currentOccurrence++;
      if (currentOccurrence === occurrence) {
        // Extract the text content between the tags for the specified occurrence
        return match.replace(new RegExp(`<${characterName}[^>]*>|</${characterName}>`, "g"), "");
      }
      return match;
    });

    // Verify that we only removed the specified occurrence of the character tag
    const remainingMatches = updatedParagraph.match(characterPattern) || [];
    if (remainingMatches.length !== matches.length - 1) {
      throw new Error("Failed to remove character tag properly");
    }

    const updatedXml = this.getBookXml().replace(originalParagraph, updatedParagraph);
    this.regenerateXml(updatedXml);
    fs.writeFileSync(`./src/data/${this.bookSlug}-chapters.xml`, updatedXml, "utf-8");
    return updatedXml;
  }

  public async openParagraphInVSCode(paragraph: string): Promise<string> {
    try {
      // Check if VS Code is installed by trying to get its version
      const vscodeVersion = spawnSync("code", ["--version"], { stdio: "pipe" });
      if (vscodeVersion.status !== 0) {
        throw new Error("VS Code is not installed or not in PATH");
      }
    } catch (error) {
      throw new Error("VS Code is not installed or not in PATH. Please install VS Code to use this feature.", error);
    }

    return new Promise((resolve, reject) => {
      // Create a temporary file
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `temp-${Date.now()}.xml`);

      // Write the initial content to the file
      fs.writeFileSync(tempFile, paragraph);

      // Spawn VS Code process
      const vscode = spawn("code", ["--wait", tempFile], { stdio: "inherit" });

      // Handle process exit
      vscode.on("close", (code) => {
        if (code === 0) {
          try {
            // Read the modified content
            const modifiedContent = fs.readFileSync(tempFile, "utf-8");
            // Clean up the temporary file
            fs.unlinkSync(tempFile);
            console.log("Modified content:", modifiedContent);
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
}

if (require.main === module) {
  (async () => {
    // const BOOK_SLUG = BOOK_SLUGS.Krolowa_Sniegu;
    // const textEditor = new TextEditor(BOOK_SLUG);
    // textEditor.addCharacter(3, 5, `<p><Gerda talking="true"/>— <Kaj>Kaj</Kaj> nie żyje! — rzekła do niego Gerda.</p>`);
    // textEditor.handleRemoveCharacter(1, 1, "Kaj", 1);
  })();
}
