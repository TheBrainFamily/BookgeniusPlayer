import { BOOK_SLUGS } from "@/consts";
import fs from "fs";
import { XmlManager } from "./xml-manager";

export class PromptsManager {
  private readonly cursorRulesPath: string = "./src/data/tools/Text-Editor/.cursor";
  private readonly promptsPath: string = "./src/data/tools/Text-Editor/prompts";

  constructor(
    private readonly bookSlug: BOOK_SLUGS,
    private readonly xmlManager: XmlManager,
  ) {
    this.bookSlug = bookSlug;
    this.xmlManager = xmlManager;
  }

  private makeRulesDirectory(): void {
    if (!fs.existsSync(this.cursorRulesPath)) {
      fs.mkdirSync(this.cursorRulesPath);
    }
    if (!fs.existsSync(`${this.cursorRulesPath}/rules`)) {
      fs.mkdirSync(`${this.cursorRulesPath}/rules`);
    }
  }

  public generateWrapCharactersRule(): void {
    try {
      const bookXml = fs.readFileSync(`./src/data/${this.bookSlug}-chapters.xml`, "utf8");
      const charactersTags = this.xmlManager.getCharactersTags(bookXml);

      const wrapCharactersRuleInitialPrompt = fs.readFileSync(`${this.promptsPath}/wrapCharactersRuleInitialPrompt.mdc`, "utf-8");

      const wrapCharactersRulePrompt = wrapCharactersRuleInitialPrompt
        .replace("{{characters}}", charactersTags.join("\n"))
        .replace("{{description}}", `Rule for wrapping ${this.bookSlug} characters by their tags from provided list.`);

      this.makeRulesDirectory();

      fs.writeFileSync(`${this.cursorRulesPath}/rules/wrap${this.bookSlug}CharactersRulePrompt.mdc`, wrapCharactersRulePrompt);
    } catch (err) {
      console.error(err);
    }
  }

  public generateMusicSuggestionRule(): void {
    try {
      const musicSuggestionInitialPrompt = fs.readFileSync(`${this.promptsPath}/musicSuggestionInitialPrompt.mdc`, "utf-8");

      this.makeRulesDirectory();

      fs.writeFileSync(`${this.cursorRulesPath}/rules/musicSuggestionRulePrompt.mdc`, musicSuggestionInitialPrompt);
    } catch (err) {
      console.error(err);
    }
  }

  public removeMusicSuggestionRule(): void {
    try {
      fs.rmSync(`${this.cursorRulesPath}/rules/musicSuggestionRulePrompt.mdc`);
    } catch (err) {
      console.error(`Fail during musicSuggestionRulePrompt: ${err}`);
    }
  }

  public removeWrapCharactersRule(): void {
    try {
      fs.rmSync(`${this.cursorRulesPath}/rules/wrap${this.bookSlug}CharactersRulePrompt.mdc`);
    } catch (err) {
      console.error(`Fail during removeWrapCharactersRulePrompt: ${err}`);
    }
  }

  public generateBackgroundSuggestionRule(): void {
    try {
      const backgroundSuggestionInitialPrompt = fs.readFileSync(`${this.promptsPath}/backgroundSuggestionInitialPrompt.mdc`, "utf-8");

      this.makeRulesDirectory();

      fs.writeFileSync(`${this.cursorRulesPath}/rules/backgroundSuggestionRulePrompt.mdc`, backgroundSuggestionInitialPrompt);
    } catch (err) {
      console.error(err);
    }
  }

  public removeBackgroundSuggestionRule(): void {
    try {
      fs.rmSync(`${this.cursorRulesPath}/rules/backgroundSuggestionRulePrompt.mdc`);
    } catch (err) {
      console.error(`Fail during backgroundSuggestionRulePrompt: ${err}`);
    }
  }
}
