import { addPaddingBottomLastChapter } from "@player/helpers/addPaddingBottomLastChapter";
import { addSpaceBetweenChapters } from "@player/helpers/addSpaceBetweenChapters";
import { getBackgroundsForBook, getBookStringified, getCharactersData } from "@player/state/bookDataStore";

/**
 * Pre-render inline avatar shell spans inside character placeholders.
 * This prevents layout shift when media is injected later.
 * Note: Must use span (not div) because these are inside <p> elements.
 */
const addInlineAvatarShells = (doc: Document) => {
  const charactersData = getCharactersData();
  const charactersBySlug = new Map(charactersData.map((c) => [c.slug, c]));

  const placeholders = doc.querySelectorAll<HTMLSpanElement>(".character-placeholder");

  placeholders.forEach((placeholder) => {
    // Skip if already has an inline-avatar
    if (placeholder.querySelector(".inline-avatar")) {
      return;
    }

    const characterSlug = placeholder.dataset.character;
    if (!characterSlug) {
      return;
    }

    const characterData = charactersBySlug.get(characterSlug);
    const displayName = characterData?.characterName ?? characterSlug;

    // Create the shell span that will hold the media later
    // Must be span (not div) because it's nested inside <p> - div would break out of <p>
    const shell = doc.createElement("span");
    shell.className = "inline-avatar relative w-full h-full";
    shell.dataset.character = characterSlug;
    shell.title = displayName;

    placeholder.appendChild(shell);
  });
};

interface ChapterRecord {
  chapterId: number;
  wrapper: HTMLElement;
  section: HTMLElement;
  paragraphCount: number;
}

type ChaptersStructureEntry = { chapterNumber: number; paragraphCount: number };

class BookIndex {
  private static instance: BookIndex;

  private initialized = false;
  private doc: Document | null = null;
  private rootTemplates: HTMLElement[] = [];
  private chapters = new Map<number, ChapterRecord>();
  private chapterOrder: number[] = [];
  private chaptersContainerSelector = "[data-chapters-container='true']";
  private paragraphCountOverrides = new Map<number, number>();

  static getInstance(): BookIndex {
    if (!BookIndex.instance) {
      BookIndex.instance = new BookIndex();
    }
    return BookIndex.instance;
  }

  invalidate(): void {
    this.initialized = false;
    this.doc = null;
    this.rootTemplates = [];
    this.chapters.clear();
    this.chapterOrder = [];
  }

  setParagraphCountOverrides(structure: ChaptersStructureEntry[]): void {
    this.paragraphCountOverrides = new Map(structure.map((entry) => [entry.chapterNumber, entry.paragraphCount]));

    if (!this.initialized) {
      return;
    }

    for (const [chapterNumber, paragraphCount] of this.paragraphCountOverrides) {
      const record = this.chapters.get(chapterNumber);
      if (record) {
        record.paragraphCount = paragraphCount;
      }
    }
  }

  /**
   * Initialize with explicit bookStringified content.
   * Use this when you have fresh content and want to avoid the store race condition.
   */
  initializeWith(bookStringified: string): void {
    // Always re-initialize when called with explicit content
    this.invalidate();
    this._parseAndInitialize(bookStringified);
  }

  /**
   * Ensure initialized using content from store (legacy behavior).
   * Prefer initializeWith() when you have the content available.
   */
  ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    const bookStringified = getBookStringified();
    if (!bookStringified) {
      throw new Error("[BookIndex] bookStringified is null - store not initialized. This usually means ensureInitialized was called before BookConvexProvider set the store.");
    }

    this._parseAndInitialize(bookStringified);
  }

  private _parseAndInitialize(bookStringified: string): void {
    const parser = new DOMParser();
    const doc = parser.parseFromString(bookStringified, "text/html");

    const chapterSections = Array.from(doc.querySelectorAll<HTMLElement>("section[data-chapter]"));

    if (chapterSections.length === 0) {
      console.warn("[BookIndex] No chapter sections found in book markup.");
    }

    if (chapterSections.length > 0) {
      if (getBackgroundsForBook().length > 0) {
        addSpaceBetweenChapters(doc, chapterSections);
      }
      addPaddingBottomLastChapter(doc, chapterSections);
      // Pre-render inline avatar shells to prevent layout shift when media is injected
      addInlineAvatarShells(doc);
    }

    // Identify chapter wrappers and container
    let chaptersContainer: HTMLElement | null = null;

    chapterSections.forEach((section) => {
      const chapterAttr = section.getAttribute("data-chapter");
      const chapterId = chapterAttr ? parseInt(chapterAttr, 10) : NaN;
      if (!Number.isFinite(chapterId)) {
        return;
      }

      const wrapper = section.parentElement as HTMLElement | null;
      if (!wrapper) {
        return;
      }

      wrapper.setAttribute("data-chapter-wrapper", String(chapterId));

      const derivedCount = section.querySelectorAll("[data-index]").length;
      const paragraphCount = this.paragraphCountOverrides.get(chapterId) ?? derivedCount;

      this.chapters.set(chapterId, { chapterId, wrapper, section, paragraphCount });
      this.chapterOrder.push(chapterId);

      if (!chaptersContainer) {
        chaptersContainer = wrapper.parentElement as HTMLElement | null;
      }
    });

    this.chapterOrder.sort((a, b) => a - b);

    if (chaptersContainer) {
      chaptersContainer.setAttribute("data-chapters-container", "true");
    }

    // Store static root templates (body children without chapter wrappers)
    this.rootTemplates = Array.from(doc.body.children).map((child) => {
      const clone = child.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("[data-chapter-wrapper]").forEach((node) => node.remove());
      return clone;
    });

    this.doc = doc;
    this.initialized = true;
  }

  getChaptersContainerSelector(): string {
    this.ensureInitialized();
    return this.chaptersContainerSelector;
  }

  createStaticRootFragment(): DocumentFragment {
    this.ensureInitialized();
    const fragment = document.createDocumentFragment();
    this.rootTemplates.forEach((template) => {
      fragment.appendChild(template.cloneNode(true));
    });
    return fragment;
  }

  cloneChapterWrapper(chapterId: number): HTMLElement {
    this.ensureInitialized();
    const record = this.chapters.get(chapterId);
    if (!record) {
      throw new Error(`[BookIndex] Unknown chapter ${chapterId}`);
    }
    return record.wrapper.cloneNode(true) as HTMLElement;
  }

  hasChapter(chapterId: number): boolean {
    this.ensureInitialized();
    return this.chapters.has(chapterId);
  }

  getFirstChapter(): number | null {
    this.ensureInitialized();
    return this.chapterOrder.length > 0 ? this.chapterOrder[0] : null;
  }

  getLastChapter(): number | null {
    this.ensureInitialized();
    return this.chapterOrder.length > 0 ? this.chapterOrder[this.chapterOrder.length - 1] : null;
  }

  getChapterOrder(): number[] {
    this.ensureInitialized();
    return [...this.chapterOrder];
  }

  getChaptersStructure(): ChaptersStructureEntry[] {
    this.ensureInitialized();
    return this.chapterOrder.map((chapterNumber) => {
      const record = this.chapters.get(chapterNumber);
      const override = this.paragraphCountOverrides.get(chapterNumber);
      return { chapterNumber, paragraphCount: override ?? record?.paragraphCount ?? 0 };
    });
  }

  getParagraphCount(chapterId: number): number {
    this.ensureInitialized();
    const record = this.chapters.get(chapterId);
    if (!record) {
      return 0;
    }
    return this.paragraphCountOverrides.get(chapterId) ?? record.paragraphCount;
  }

  getParagraphElements(chapterId: number): HTMLElement[] {
    this.ensureInitialized();
    const record = this.chapters.get(chapterId);
    if (!record) {
      return [];
    }
    return Array.from(record.section.querySelectorAll<HTMLElement>("[data-index]"));
  }

  getParagraphElement(chapterId: number, paragraphIndex: number): HTMLElement | null {
    this.ensureInitialized();
    const record = this.chapters.get(chapterId);
    if (!record) {
      return null;
    }
    return record.section.querySelector<HTMLElement>(`[data-index="${paragraphIndex}"]`);
  }
}

export const bookIndex = BookIndex.getInstance();
