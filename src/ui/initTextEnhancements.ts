import { setupParagraphHighlighting } from "./paragraphHighlighting";
import { setupInlineAvatars } from "./inlineAvatars";

/**
 * Initialize all text enhancement features
 */
export function initTextEnhancements(): void {
  // Set up paragraph highlighting (existing functionality)
  setupParagraphHighlighting();

  // Set up inline character avatars (new functionality)
  setupInlineAvatars();
}
