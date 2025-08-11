import { RequestHandler } from "express";
import { TextEditorService } from "../services/textEditorService";

export class TextEditorController {
  private textEditorService: TextEditorService;

  constructor() {
    this.textEditorService = new TextEditorService();
  }

  public removeCharacter: RequestHandler = async (req, res) => {
    try {
      const { chapterNumber, paragraphNumber, characterName, occurrenceNumber, bookName } = req.body;

      if (!chapterNumber || !paragraphNumber || !characterName || !occurrenceNumber || !bookName) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
      }

      const result = this.textEditorService.removeCharacter(Number(chapterNumber), Number(paragraphNumber), characterName, Number(occurrenceNumber), bookName);

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  };
}
