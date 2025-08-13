import { Router } from "express";
import { TextEditorController } from "../controllers/textEditorController";
import { SSEController } from "../controllers/sseController";

const router = Router();
const textEditorController = new TextEditorController();
const sseController = new SSEController();

router.post("/remove-character", textEditorController.removeCharacter);

// SSE endpoint for book updates
router.get("/sse/book-updates", sseController.bookUpdates);

// Endpoint for paragraph selection from Reader
router.post("/sse/select-paragraph", sseController.selectParagraph);

export default router;
