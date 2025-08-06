import { Router } from "express";
import { TextEditorController } from "../controllers/textEditorController";
import { SSEController } from "../controllers/sseController";

const router = Router();
const textEditorController = new TextEditorController();
const sseController = new SSEController();

router.post("/edit-paragraph", textEditorController.editParagraph);

router.post("/remove-character", textEditorController.removeCharacter);

router.post("/add-character", textEditorController.addCharacter);

router.post("/edit-sentence", textEditorController.editSentence);

router.post("/add-music-suggestion", textEditorController.addMusicSuggestion);

router.post("/remove-music-suggestion", textEditorController.removeMusicSuggestion);

router.post("/add-background-suggestion", textEditorController.addBackgroundSuggestion);

router.post("/remove-background-suggestion", textEditorController.removeBackgroundSuggestion);

// SSE endpoint for book updates
router.get("/sse/book-updates", sseController.bookUpdates);

// Endpoint for paragraph selection from Reader
router.post("/sse/select-paragraph", sseController.selectParagraph);

export default router;
