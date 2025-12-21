import { addPaddingBottomLastChapter } from "@player/helpers/addPaddingBottomLastChapter";
import { addSpaceBetweenChapters } from "@player/helpers/addSpaceBetweenChapters";
import { getBackgroundsForBook, getBookStringified, getCharactersData } from "@player/state/bookDataStore";

/**
 * Pre-render inline avatar shell divs inside character placeholders.
 * This prevents layout shift when media is injected later.
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

    // Create the shell div that will hold the media later
    const shell = doc.createElement("div");
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

  ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    const bookStringified = getBookStringified();
    if (!bookStringified) {
      throw new Error("[BookIndex] bookStringified is null - store not initialized. This usually means ensureInitialized was called before BookConvexProvider set the store.");
    }

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

      const paragraphCount = section.querySelectorAll("[data-index]").length;

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
    return this.chapterOrder.map((chapterNumber) => ({ chapterNumber, paragraphCount: this.chapters.get(chapterNumber)!.paragraphCount }));
  }

  getParagraphCount(chapterId: number): number {
    this.ensureInitialized();
    const record = this.chapters.get(chapterId);
    if (!record) {
      return 0;
    }
    return record.paragraphCount;
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
