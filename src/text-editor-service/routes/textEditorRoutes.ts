import { Router } from "express";
import { TextEditorController } from "../controllers/textEditorController";

const router = Router();
const textEditorController = new TextEditorController();

// Add a character to a paragraph
router.post("/character", textEditorController.addCharacter);

// Get a paragraph by chapter and paragraph number
router.get("/paragraph/:chapterNumber/:paragraphNumber", textEditorController.getParagraph);

// Remove a character from a paragraph
router.delete("/character", textEditorController.removeCharacter);

export default router;
