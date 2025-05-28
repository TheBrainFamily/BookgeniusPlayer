import { RequestHandler } from "express";
import { TextEditorService } from "../services/textEditorService";
import { CURRENT_BOOK } from "@/consts";

export class TextEditorController {
  private textEditorService: TextEditorService;

  constructor() {
    this.textEditorService = new TextEditorService(CURRENT_BOOK);
  }

  public editParagraph: RequestHandler = async (req, res) => {
    try {
      const { chapterNumber, paragraphNumber } = req.body;

      if (!chapterNumber || !paragraphNumber) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
      }

      const result = await this.textEditorService.editParagraph(Number(chapterNumber), Number(paragraphNumber));

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  };

  public removeCharacter: RequestHandler = async (req, res) => {
    try {
      const { chapterNumber, paragraphNumber, characterName, occurrenceNumber } = req.body;

      if (!chapterNumber || !paragraphNumber || !characterName || !occurrenceNumber) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
      }

      const result = this.textEditorService.removeCharacter(Number(chapterNumber), Number(paragraphNumber), characterName, Number(occurrenceNumber));

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  };

  public addCharacter: RequestHandler = async (req, res) => {
    try {
      const { chapterNumber, paragraphNumber, characterName, selectedText, startSelectedWordIndex, endSelectedWordIndex } = req.body;

      if (!chapterNumber || !paragraphNumber || !characterName || !selectedText || !startSelectedWordIndex || !endSelectedWordIndex) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
      }

      const result = this.textEditorService.addCharacter(
        Number(chapterNumber),
        Number(paragraphNumber),
        characterName,
        selectedText,
        Number(startSelectedWordIndex),
        Number(endSelectedWordIndex),
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  };
}
