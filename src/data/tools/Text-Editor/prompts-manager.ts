import { BOOK_SLUGS } from "@/consts";
import fs from "fs";
import { XmlManager } from "@/data/tools/Text-Editor/xml-manager";

export class PromptsManager {
  private readonly xmlManager: XmlManager;
  private readonly cursorRulesPath: string = "./src/data/tools/Text-Editor/.cursor";
  private readonly promptsPath: string = "./src/data/tools/Text-Editor/prompts";

  constructor(private readonly bookSlug: BOOK_SLUGS) {
    this.bookSlug = bookSlug;
    this.xmlManager = new XmlManager();
  }

  public generateWrapCharactersRule(): void {
    try {
      const bookXml = fs.readFileSync(`./src/data/${this.bookSlug}-chapters.xml`, "utf8");
      const charactersTags = this.xmlManager.getCharactersTags(bookXml);

      const wrapCharactersRuleInitialPrompt = fs.readFileSync(`${this.promptsPath}/wrapCharactersRuleInitialPrompt.mdc`, "utf-8");

      const wrapCharactersRulePrompt = wrapCharactersRuleInitialPrompt
        .replace("{{characters}}", charactersTags.join("\n"))
        .replace("{{description}}", `Rule for wrapping ${this.bookSlug} characters by their tags from provided list.`);

      if (!fs.existsSync(this.cursorRulesPath)) {
        fs.mkdirSync(this.cursorRulesPath);
        fs.mkdirSync(`${this.cursorRulesPath}/rules`);
      }

      fs.writeFileSync(`${this.cursorRulesPath}/rules/wrap${this.bookSlug}CharactersRulePrompt.mdc`, wrapCharactersRulePrompt);
    } catch (err) {
      console.error(err);
    }
  }

  public removeWrapCharactersRule(): void {
    try {
      fs.rmSync(`${this.cursorRulesPath}/rules/wrap${this.bookSlug}CharactersRulePrompt.mdc`);
    } catch (err) {
      console.error(`Fail during removeWrapCharactersRulePrompt: ${err}`);
    }
  }
}
