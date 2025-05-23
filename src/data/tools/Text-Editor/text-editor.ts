import { BOOK_SLUGS } from "@/consts";
import { DOMParser } from "@xmldom/xmldom";
import fs from "fs";
import { xmlToComplexHtml } from "@/data/xmlToComplexHtml";
import { spawn } from "child_process";
import * as path from "path";
import * as os from "os";

export class TextEditor {
  constructor(private readonly bookSlug: BOOK_SLUGS) {
    this.bookSlug = bookSlug;
  }

  private getBookXml() {
    return fs.readFileSync(`./src/data/${this.bookSlug}-chapters.xml`, "utf8");
  }

  private regenerateXml(xmlString: string) {
    const htmlString = xmlToComplexHtml(xmlString, this.bookSlug);
    fs.writeFileSync(`./src/data/chapters-${this.bookSlug}.ts`, `export const ${this.bookSlug.replace(/-/g, "")}BookXml = \`<section>${htmlString}</section>\`;`);
  }

  private isSimilarParagraph(original: string, updated: string): boolean {
    // Use DOMParser to extract text content from both strings
    const parser = new DOMParser();
    const getTextContent = (str: string) => {
      const doc = parser.parseFromString(str, "text/xml");
      return doc.documentElement && doc.documentElement.textContent ? doc.documentElement.textContent.trim() : "";
    };

    const originalText = getTextContent(original);
    const updatedText = getTextContent(updated);

    // Check if the text content is the same
    return originalText === updatedText;
  }

  public async addCharacter(chapterNumber: number, paragraphNumber: number, updatedParagraphText?: string) {
    const originalParagraph = this.getParagraphByNumber(chapterNumber, paragraphNumber);

    if (!originalParagraph) {
      throw new Error("Paragraph not found");
    }

    // if (!this.isSimilarParagraph(originalParagraph, updatedParagraphText)) {
    //   throw new Error("Updated paragraph text is too different from the original");
    // }

    updatedParagraphText = await this.openInVSCode(originalParagraph);

    const updatedXml = this.getBookXml().replace(originalParagraph, updatedParagraphText);
    fs.writeFileSync(`./src/data/${this.bookSlug}-chapters.xml`, updatedXml, "utf-8");
    this.regenerateXml(updatedXml);
    return updatedXml;
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

  public async openInVSCode(content: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create a temporary file
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `temp-${Date.now()}.xml`);

      // Write the initial content to the file
      fs.writeFileSync(tempFile, content);

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
    const BOOK_SLUG = BOOK_SLUGS.Krolowa_Sniegu;

    const textEditor = new TextEditor(BOOK_SLUG);

    // textEditor.addCharacter(3, 5, `<p><Gerda talking="true"/>— <Kaj>Kaj</Kaj> nie żyje! — rzekła do niego Gerda.</p>`);

    textEditor.removeCharacter(1, 1, "Kaj", 1);
  })();
}
