import { BOOK_SLUGS } from "@/consts";
import fs from "fs";
import { XmlManager } from "@/data/tools/Text-Editor/xml-manager";

export class PromptsManager {
  private readonly xmlManager: XmlManager;
  constructor(private readonly bookSlug: BOOK_SLUGS) {
    this.bookSlug = bookSlug;
    this.xmlManager = new XmlManager();
  }

  public generateWrapCharactersRule(): void {
    const bookXml = fs.readFileSync(`./src/data/${this.bookSlug}-chapters.xml`, "utf8");
    const charactersTags = this.xmlManager.getCharactersTags(bookXml);

    const wrapCharactersRulePattern = fs.readFileSync("./src/data/tools/Text-Editor/prompts/wrapCharactersRulePattern.mdc", "utf-8");

    const wrapCharactersRule = wrapCharactersRulePattern
      .replace("{{characters}}", charactersTags.join("\n"))
      .replace("{{description}}", `Rule for wrapping ${this.bookSlug} characters by their tags from provided list.`);

    fs.writeFileSync(`.cursor/rules/wrap${this.bookSlug}CharactersRulePattern.mdc`, wrapCharactersRule);
  }
}
