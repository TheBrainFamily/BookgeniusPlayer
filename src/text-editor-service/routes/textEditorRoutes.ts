import { Router } from "express";
import { TextEditorController } from "../controllers/textEditorController";

const router = Router();
const textEditorController = new TextEditorController();

router.post("/edit-paragraph", textEditorController.editParagraph);

router.post("/remove-character", textEditorController.removeCharacter);

router.post("/add-character", textEditorController.addCharacter);

router.post("/add-music-shift", textEditorController.addMusicSuggestionToParagraph);

router.post("/remove-music-shift", textEditorController.removeMusicShift);

// // Add a character to a paragraph
// router.post("/character", textEditorController.addCharacter);
//
// // Get a paragraph by chapter and paragraph number
// router.get("/paragraph/:chapterNumber/:paragraphNumber", textEditorController.getParagraph);
//
// // Remove a character from a paragraph
// router.delete("/character", textEditorController.handleRemoveCharacter);

export default router;
