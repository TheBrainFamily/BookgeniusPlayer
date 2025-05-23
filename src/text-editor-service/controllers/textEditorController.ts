import { RequestHandler } from "express";
import { TextEditorService } from "../services/textEditorService";
import { BOOK_SLUGS } from "@/consts";

export class TextEditorController {
  private textEditorService: TextEditorService;

  constructor() {
    this.textEditorService = new TextEditorService(BOOK_SLUGS.Krolowa_Sniegu);
  }

  public editParagraph: RequestHandler = async (req, res) => {
    try {
      const { chapterNumber, paragraphNumber } = req.body;

      if (!chapterNumber || !paragraphNumber) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
      }

      const result = this.textEditorService.editParagraph(Number(chapterNumber), Number(paragraphNumber));

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

      console.log("44: req.body BANG!", req.body);

      const result = this.textEditorService.removeCharacter(Number(chapterNumber), Number(paragraphNumber), characterName, Number(occurrenceNumber));

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  };
}
