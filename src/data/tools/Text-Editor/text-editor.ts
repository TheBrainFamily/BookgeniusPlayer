import { BOOK_SLUGS } from "@/consts";
import { DOMParser, Document, XMLSerializer } from "@xmldom/xmldom";
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
    // Get the exact XML string by using the node's outerHTML equivalent
    return paragraph.toString().replace(/^<[^>]+>|<\/[^>]+>$/g, "");
  }

  public async editParagraph(chapterNumber: number, paragraphNumber: number): Promise<void> {
    const originalParagraph = this.getParagraphByNumber(chapterNumber, paragraphNumber);

    if (!originalParagraph) {
      throw new Error("Paragraph not found");
    }

    const updatedParagraphText = await this.openParagraphInVSCode(originalParagraph);

    const text = this.getBookXml();

    const updatedXml = this.replaceParagraphInXml(text, originalParagraph, updatedParagraphText);

    fs.writeFileSync(`./src/data/${this.bookSlug}-chapters.xml`, updatedXml, "utf-8");
    this.regenerateXml(updatedXml);
  }

  private decodeHtmlEntities(text: string): string {
    const entities: { [key: string]: string } = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'" };
    return text.replace(/&(?:lt|gt|amp|quot|#39);/g, (match) => entities[match]);
  }

  private replaceParagraphUsingDOMParser(xmlDoc: Document, chapterNumber: number, paragraphNumber: number, newContent: string): string {
    const chapters = xmlDoc.getElementsByTagName("Chapter");
    const chapter = chapters[chapterNumber - 1];
    const paragraphs = Array.from(chapter.childNodes).filter((node) => node.nodeType === 1);
    const paragraph = paragraphs[paragraphNumber];

    // Create a new text node with the updated content
    const newTextNode = xmlDoc.createTextNode(newContent);

    // Clear the existing paragraph content and append the new content
    while (paragraph.firstChild) {
      paragraph.removeChild(paragraph.firstChild);
    }
    paragraph.appendChild(newTextNode);

    // Use XMLSerializer to get raw XML output and decode HTML entities
    const serializer = new XMLSerializer();
    const serializedXml = serializer.serializeToString(xmlDoc);
    return this.decodeHtmlEntities(serializedXml);
  }

  public addCharacter(chapterNumber: number, paragraphNumber: number, characterName: string, word: string, wordIndex: number): string {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(this.getBookXml(), "text/xml");
    const chapters = xmlDoc.getElementsByTagName("Chapter");

    if (chapterNumber <= 0 || chapterNumber > chapters.length) {
      throw new Error("Chapter not found");
    }

    const chapter = chapters[chapterNumber - 1];
    const paragraphs = Array.from(chapter.childNodes).filter((node) => node.nodeType === 1);

    if (paragraphNumber < 0 || paragraphNumber >= paragraphs.length) {
      throw new Error("Paragraph not found");
    }

    const paragraph = paragraphs[paragraphNumber];
    const paragraphText = paragraph.toString().replace(/^<[^>]+>|<\/[^>]+>$/g, "");

    const characterTag = `<${characterName}>${word}</${characterName}>`;

    const parts = paragraphText.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);
    const words: string[] = [];

    for (const part of parts) {
      if (part.trim()) {
        if (part.match(/<[^>]+>.*?<\/[^>]+>|<[^>]+\/>/)) {
          words.push(part);
        } else {
          const subParts = part.split(/(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);
          for (const subPart of subParts) {
            if (subPart.trim()) {
              if (subPart.match(/<[^>]+>.*?<\/[^>]+>|<[^>]+\/>/)) {
                words.push(subPart);
              } else {
                words.push(
                  ...subPart
                    .split(/\s+/)
                    .map((w) => w.replace(/[.,!?;:()[\]{}"'\-–—]/g, ""))
                    .filter((w) => w.length > 0 && /[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(w)),
                );
              }
            }
          }
        }
      }
    }

    let currentWordIndex = 0;
    for (let i = 0; i < words.length; i++) {
      const currentWord = words[i];
      if (currentWord.startsWith("<")) continue;

      if (currentWordIndex === wordIndex) {
        if (currentWord !== word) {
          console.error("Word at specified index does not match the provided word");
          return this.getBookXml();
        }
        words[i] = characterTag;
        break;
      }
      currentWordIndex++;
    }

    const updatedParagraphText = words.join(" ").replace(/\s+(<note id="\d+"\/>)/g, "$1");

    // Replace the paragraph content using DOMParser
    const updatedXml = this.replaceParagraphUsingDOMParser(xmlDoc, chapterNumber, paragraphNumber, updatedParagraphText);

    fs.writeFileSync(`./src/data/${this.bookSlug}-chapters.xml`, updatedXml, "utf-8");
    this.regenerateXml(updatedXml);
    return updatedXml;
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
    fs.writeFileSync(`./src/data/${this.bookSlug}-chapters.xml`, updatedXml, "utf-8");
    this.regenerateXml(this.getBookXml());
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

  private replaceParagraphInXml(text: string, originalParagraph: string, updatedParagraphText: string): string {
    // First, temporarily replace XML tags with placeholders
    const xmlTagPlaceholders: { [key: string]: string } = {};
    let placeholderCounter = 0;

    const paragraphWithPlaceholders = originalParagraph.replace(/<[^>]+>/g, (match) => {
      const placeholder = `__XML_TAG_${placeholderCounter}__`;
      xmlTagPlaceholders[placeholder] = match;
      placeholderCounter++;
      return placeholder;
    });

    // Escape special regex characters in the text between XML tags
    const escapedText = paragraphWithPlaceholders.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Restore XML tags
    const finalRegex = escapedText.replace(/__XML_TAG_\d+__/g, (placeholder) => {
      return xmlTagPlaceholders[placeholder].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });

    const paragraphRegex = new RegExp(finalRegex, "s");
    return text.replace(paragraphRegex, updatedParagraphText);
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
