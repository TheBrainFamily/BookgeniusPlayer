import { Router } from "express";
import { TextEditorController } from "../controllers/textEditorController";

const router = Router();
const textEditorController = new TextEditorController();

router.post("/edit-paragraph", textEditorController.editParagraph);

router.post("/remove-character", textEditorController.removeCharacter);

router.post("/add-character", textEditorController.addCharacter);

router.post("/add-music-suggestion", textEditorController.addMusicSuggestion);

router.post("/remove-music-suggestion", textEditorController.removeMusicSuggestion);

router.post("/add-background-suggestion", textEditorController.addBackgroundSuggestion);

router.post("/remove-background-suggestion", textEditorController.removeBackgroundSuggestion);

export default router;
