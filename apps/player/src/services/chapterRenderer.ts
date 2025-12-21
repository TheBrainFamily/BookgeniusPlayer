/**
 * Chapter Renderer
 *
 * Renders a chapter's XML content to a DOM element ready for insertion
 * into the virtualizer. This is the bridge between Convex data and the
 * imperative DOM manipulation in BookContentVirtualizer.
 *
 * Usage:
 *   const element = await renderChapterToElement({
 *     chapterId: 1,
 *     chapterXml: "<Chapter>...</Chapter>",
 *     characterContext,
 *     bookSlug: "1984-English",
 *     bookLang: "english",
 *     bookForm: "prose",
 *   });
 *   container.appendChild(element);
 */

import { processChapterXml, type CharacterInfo } from "./chapterProcessor";

// =============================================================================
// Types
// =============================================================================

export interface RenderChapterOptions {
  chapterId: number;
  chapterXml: string;
  characterContext: Map<string, CharacterInfo>;
  bookSlug: string;
  bookLang?: string;
  bookForm?: string;
}

export interface RenderedChapter {
  wrapper: HTMLElement;
  paragraphCount: number;
  title?: string;
}

// =============================================================================
// Renderer
// =============================================================================

/**
 * Render a chapter's XML content to a DOM element.
 *
 * Returns a wrapper element with:
 * - data-chapter-wrapper attribute for virtualizer tracking
 * - Inner section with data-chapter attribute
 * - All paragraphs with data-index attributes for IntersectionObserver
 */
export function renderChapterToElement(options: RenderChapterOptions): RenderedChapter {
  const { chapterId, chapterXml, characterContext, bookSlug, bookLang = "english", bookForm = "prose" } = options;

  // Process XML to HTML
  const { html, paragraphCount, title } = processChapterXml(chapterXml, characterContext, chapterId, bookSlug, bookLang, bookForm);

  // Create wrapper element (matches structure expected by virtualizer)
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-chapter-wrapper", String(chapterId));

  // Insert the processed HTML
  // The HTML already contains the <section data-chapter="N">...</section>
  wrapper.innerHTML = html;

  // Add inline avatar shells for character placeholders (prevents layout shift)
  addInlineAvatarShells(wrapper);

  return { wrapper, paragraphCount, title };
}

/**
 * Pre-render inline avatar shell divs inside character placeholders.
 * This prevents layout shift when media is injected later.
 */
function addInlineAvatarShells(container: HTMLElement): void {
  const placeholders = container.querySelectorAll<HTMLSpanElement>(".character-placeholder");

  placeholders.forEach((placeholder) => {
    // Skip if already has an inline-avatar
    if (placeholder.querySelector(".inline-avatar")) {
      return;
    }

    const characterSlug = placeholder.dataset.character;
    if (!characterSlug) {
      return;
    }

    // Create the shell div that will hold the media later
    const shell = document.createElement("div");
    shell.className = "inline-avatar relative w-full h-full";
    shell.dataset.character = characterSlug;
    shell.title = characterSlug;

    placeholder.appendChild(shell);
  });
}

// =============================================================================
// Chapter Content Cache
// =============================================================================

/**
 * Simple in-memory cache for chapter content.
 * Stores fetched XML content by versionId to avoid re-fetching.
 */
class ChapterContentCache {
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<string | null>>();

  get(versionId: string): string | undefined {
    return this.cache.get(versionId);
  }

  set(versionId: string, content: string): void {
    this.cache.set(versionId, content);
  }

  has(versionId: string): boolean {
    return this.cache.has(versionId);
  }

  /**
   * Get or fetch chapter content.
   * If already cached, returns immediately.
   * If fetch is in progress, waits for it.
   * Otherwise, starts a new fetch.
   */
  async getOrFetch(versionId: string, fetcher: (versionId: string) => Promise<{ content: string } | null>): Promise<string | null> {
    // Return cached content if available
    const cached = this.cache.get(versionId);
    if (cached !== undefined) {
      return cached;
    }

    // Wait for pending fetch if in progress
    const pending = this.pending.get(versionId);
    if (pending) {
      return pending;
    }

    // Start new fetch
    const fetchPromise = (async () => {
      try {
        const result = await fetcher(versionId);
        if (result?.content) {
          this.cache.set(versionId, result.content);
          return result.content;
        }
        return null;
      } finally {
        this.pending.delete(versionId);
      }
    })();

    this.pending.set(versionId, fetchPromise);
    return fetchPromise;
  }

  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }

  /**
   * Invalidate a specific chapter's cached content.
   * Call this when a chapter's versionId changes.
   */
  invalidate(versionId: string): void {
    this.cache.delete(versionId);
  }
}

export const chapterContentCache = new ChapterContentCache();
