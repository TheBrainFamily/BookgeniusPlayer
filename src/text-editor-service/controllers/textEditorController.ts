import { RequestHandler } from "express";
import { TextEditorService } from "../services/textEditorService";
import { BOOK_SLUGS } from "@/consts";

export class TextEditorController {
  private textEditorService: TextEditorService;

  constructor() {
    // For now, we'll use Krolowa_Sniegu as the default book
    this.textEditorService = new TextEditorService(BOOK_SLUGS.Krolowa_Sniegu);
  }

  public addCharacter: RequestHandler = async (req, res) => {
    try {
      const { chapterNumber, paragraphNumber, updatedParagraphText } = req.body;

      if (!chapterNumber || !paragraphNumber || !updatedParagraphText) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
      }

      const result = this.textEditorService.addCharacter(Number(chapterNumber), Number(paragraphNumber), updatedParagraphText);

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error occurred" });
    }
  };

  public getParagraph: RequestHandler = async (req, res) => {
    try {
      const { chapterNumber, paragraphNumber } = req.params;

      if (!chapterNumber || !paragraphNumber) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
      }

      const result = this.textEditorService.getParagraphByNumber(Number(chapterNumber), Number(paragraphNumber));

      if (!result) {
        res.status(404).json({ error: "Paragraph not found" });
        return;
      }

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error occurred" });
    }
  };

  public removeCharacter: RequestHandler = async (req, res) => {
    try {
      const { chapterNumber, paragraphNumber, characterName, occurrence } = req.body;

      if (!chapterNumber || !paragraphNumber || !characterName) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
      }

      const result = this.textEditorService.removeCharacter(Number(chapterNumber), Number(paragraphNumber), characterName, occurrence ? Number(occurrence) : 1);

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error occurred" });
    }
  };
}
