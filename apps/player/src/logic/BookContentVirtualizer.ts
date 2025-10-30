import { bookIndex } from "@player/logic/BookIndex";

console.log("[BookContentVirtualizer] [BookContentVirtualizer] BookContentVirtualizer version OCT30");
type ContentChangedCallback = (mountedChapters: number[]) => void;

class ChapterVirtualizer {
  private mountedChapters: number[] = [];
  private topSpacer: HTMLDivElement;

  constructor(
    private host: HTMLElement,
    private onContentChanged?: ContentChangedCallback,
  ) {
    this.topSpacer = this.ensureTopSpacer();
  }

  private ensureTopSpacer(): HTMLDivElement {
    const existing = this.host.querySelector<HTMLDivElement>("#virtual-top-spacer");
    if (existing) return existing;
    const spacer = document.createElement("div");
    spacer.id = "virtual-top-spacer";
    spacer.style.height = "0px";
    spacer.style.width = "100%";
    spacer.style.pointerEvents = "none";
    spacer.style.flexShrink = "0";
    // Prevent the spacer from becoming an anchor candidate
    spacer.style.setProperty("overflow-anchor", "none");
    this.host.insertBefore(spacer, this.host.firstChild);
    return spacer;
  }

  private getTopSpacerHeight(): number {
    const h = parseFloat(this.topSpacer.style.height || "0");
    return Number.isFinite(h) ? h : 0;
  }

  private setTopSpacerHeight(h: number) {
    const normalized = Math.max(0, Math.round(h));
    this.topSpacer.style.height = `${normalized}px`;
  }

  private getOuterHeight(el: HTMLElement): number {
    const rect = el.getBoundingClientRect();
    const styles = window.getComputedStyle(el);
    const mt = parseFloat(styles.marginTop) || 0;
    const mb = parseFloat(styles.marginBottom) || 0;
    return rect.height + mt + mb;
  }

  ensureWindow(targetChapter: number, forceRemount = false): void {
    if (!bookIndex.hasChapter(targetChapter)) {
      const first = bookIndex.getFirstChapter();
      const last = bookIndex.getLastChapter();
      if (first === null || last === null) {
        return;
      }
      if (targetChapter < first) {
        targetChapter = first;
      } else if (targetChapter > last) {
        targetChapter = last;
      } else {
        // Target chapter missing from index (shouldn't happen), snap to nearest
        targetChapter = Math.max(first, Math.min(last, targetChapter));
      }
    }

    const candidates = [targetChapter - 1, targetChapter, targetChapter + 1];
    const nextWindow = candidates.filter((chapterId) => bookIndex.hasChapter(chapterId));

    const desiredOrder = nextWindow.slice().sort((a, b) => a - b);
    const desiredSet = new Set(desiredOrder);

    const wrappers = Array.from(this.host.querySelectorAll<HTMLElement>("[data-chapter-wrapper]"));
    const existing = new Map<number, HTMLElement>();
    wrappers.forEach((wrapper) => {
      const chapterAttr = wrapper.getAttribute("data-chapter-wrapper");
      if (!chapterAttr) return;
      const chapterId = parseInt(chapterAttr, 10);
      if (!Number.isFinite(chapterId)) return;
      existing.set(chapterId, wrapper);
    });

    const contentContainer = this.host.closest<HTMLElement>("#content-container");
    const containerRect = contentContainer?.getBoundingClientRect() ?? null;

    const wrappersToRemove: HTMLElement[] = [];
    wrappers.forEach((wrapper) => {
      const chapterAttr = wrapper.getAttribute("data-chapter-wrapper");
      const chapterId = chapterAttr ? parseInt(chapterAttr, 10) : NaN;
      if (!Number.isFinite(chapterId)) return;
      if (forceRemount) {
        wrappersToRemove.push(wrapper);
        existing.delete(chapterId);
        return;
      }

      if (!desiredSet.has(chapterId)) {
        // Only remove wrappers that are fully off-screen to avoid visible jumps.
        if (!containerRect) {
          // Fallback: if we can't measure, remove as before.
          wrappersToRemove.push(wrapper);
          existing.delete(chapterId);
          return;
        }

        const rect = wrapper.getBoundingClientRect();
        const margin = 200; // safety margin to avoid removing near boundary
        const fullyAbove = rect.bottom <= containerRect.top - margin;
        const fullyBelow = rect.top >= containerRect.bottom + margin;

        if (fullyAbove || fullyBelow) {
          wrappersToRemove.push(wrapper);
          existing.delete(chapterId);
        }
      }
    });

    // One-frame mutation: measure then update top spacer and remove
    const toRemoveAbove: HTMLElement[] = [];
    const toRemoveBelow: HTMLElement[] = [];
    wrappersToRemove.forEach((wrapper) => {
      if (!containerRect) {
        toRemoveBelow.push(wrapper);
        return;
      }
      const rect = wrapper.getBoundingClientRect();
      const fullyAbove = rect.bottom <= containerRect.top;
      if (fullyAbove) toRemoveAbove.push(wrapper);
      else toRemoveBelow.push(wrapper);
    });

    // Choose a stable anchor wrapper for removal compensation: the first wrapper after top spacer
    // that is NOT being removed. We'll keep its visual top unchanged.
    const removingAboveSet = new Set(toRemoveAbove);
    const findAnchorAfterSpacer = (): HTMLElement | null => {
      let node = this.topSpacer.nextElementSibling as HTMLElement | null;
      while (node) {
        if (node.hasAttribute && node.hasAttribute("data-chapter-wrapper") && !removingAboveSet.has(node)) {
          return node;
        }
        node = node.nextElementSibling as HTMLElement | null;
      }
      return null;
    };

    const anchorBefore = findAnchorAfterSpacer();
    const anchorTopBefore = anchorBefore && containerRect ? anchorBefore.getBoundingClientRect().top - containerRect.top : null;

    // Increase top spacer by our estimate first, then remove
    if (toRemoveAbove.length > 0) {
      let removedHeight = 0;
      toRemoveAbove.forEach((w) => (removedHeight += this.getOuterHeight(w)));
      this.setTopSpacerHeight(this.getTopSpacerHeight() + removedHeight);
    }
    toRemoveAbove.forEach((w) => w.remove());
    toRemoveBelow.forEach((w) => w.remove());

    // Measure actual shift and correct any mismatch
    if (anchorBefore && containerRect && anchorTopBefore !== null) {
      const anchorTopAfter = anchorBefore.getBoundingClientRect().top - containerRect.top;
      const delta = anchorTopAfter - anchorTopBefore; // positive -> content moved down
      if (delta !== 0) {
        this.setTopSpacerHeight(this.getTopSpacerHeight() - delta);
      }
    }

    // Build or reuse desired wrappers; insert previous chapters after top spacer to preserve scroll position
    desiredOrder.forEach((chapterId) => {
      let element = existing.get(chapterId);
      if (!element) {
        element = bookIndex.cloneChapterWrapper(chapterId);
        existing.set(chapterId, element);

        // If this is a prepend case (older than currently smallest mounted), insert after top spacer and adjust scroll
        const currentMin = this.mountedChapters.length > 0 ? Math.min(...this.mountedChapters) : Infinity;
        if (chapterId < currentMin) {
          // Insert previous chapter after top spacer while keeping the next wrapper visually stable.
          const nextWrapperBefore = this.topSpacer.nextElementSibling as HTMLElement | null;
          const beforeTop = nextWrapperBefore && containerRect ? nextWrapperBefore.getBoundingClientRect().top - containerRect.top : null;

          // Insert after top spacer
          const ref = this.topSpacer.nextSibling;
          this.host.insertBefore(element, ref);

          // Compute actual push applied to the next wrapper and compensate using the top spacer first.
          const afterTop = nextWrapperBefore && containerRect ? nextWrapperBefore.getBoundingClientRect().top - containerRect.top : null;
          if (beforeTop !== null && afterTop !== null) {
            const delta = afterTop - beforeTop; // positive when pushed down
            if (delta !== 0) {
              // Adjust only the spacer; rely on browser anchoring for any tiny remainder.
              const newHeight = this.getTopSpacerHeight() - delta;
              this.setTopSpacerHeight(newHeight);
            }
          }
        } else {
          this.host.appendChild(element);
        }
      }
    });

    if (!forceRemount && this.arraysEqual(this.mountedChapters, desiredOrder)) {
      return;
    }

    // Update mounted list by reading current DOM order (excluding the top spacer)
    const nowWrappers = Array.from(this.host.querySelectorAll<HTMLElement>("[data-chapter-wrapper]"));
    this.mountedChapters = nowWrappers
      .map((w) => parseInt(w.getAttribute("data-chapter-wrapper") || "", 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    this.onContentChanged?.([...this.mountedChapters]);
  }

  destroy(): void {
    // Keep host clean including top spacer
    this.host.replaceChildren();
    this.mountedChapters = [];
  }

  getMountedChapters(): number[] {
    return [...this.mountedChapters];
  }

  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
}

interface InitializeOptions {
  container: HTMLElement;
  onContentChanged?: ContentChangedCallback;
}

let virtualizer: ChapterVirtualizer | null = null;
let chaptersHost: HTMLElement | null = null;
let currentContainer: HTMLElement | null = null;
let pendingInitialization: Promise<void> | null = null;
let resolveInitialization: (() => void) | null = null;
let cachedOptions: InitializeOptions | null = null;

const ensureInitializationPromise = (): Promise<void> => {
  if (!pendingInitialization) {
    pendingInitialization = new Promise((resolve) => {
      resolveInitialization = resolve;
    });
  }
  return pendingInitialization;
};

export const initializeBookContentVirtualizer = async (options: InitializeOptions): Promise<void> => {
  cachedOptions = options;
  ensureInitializationPromise();

  disposeVirtualizer();

  try {
    bookIndex.ensureInitialized();

    const { container, onContentChanged } = options;
    currentContainer = container;

    container.innerHTML = "";
    const staticRoot = bookIndex.createStaticRootFragment();
    container.appendChild(staticRoot);

    const host = container.querySelector<HTMLElement>(bookIndex.getChaptersContainerSelector());
    if (!host) {
      throw new Error("[BookContentVirtualizer] Chapters container not found in rendered template.");
    }

    chaptersHost = host;
    virtualizer = new ChapterVirtualizer(host, onContentChanged);
  } finally {
    resolveInitialization?.();
    resolveInitialization = null;
    pendingInitialization = null;
  }
};

export const ensureChapterWindow = async (chapterId: number, options: { force?: boolean } = {}): Promise<void> => {
  if (!virtualizer || !chaptersHost) {
    await ensureInitializationPromise();
  }

  if (!virtualizer) {
    throw new Error("[BookContentVirtualizer] ensureChapterWindow called before initialization.");
  }

  virtualizer.ensureWindow(chapterId, options.force ?? false);
};

export const getMountedChapters = (): number[] => {
  return virtualizer ? virtualizer.getMountedChapters() : [];
};

export const disposeVirtualizer = (): void => {
  virtualizer?.destroy();
  virtualizer = null;
  chaptersHost = null;
  currentContainer = null;
};

export const reloadVirtualizer = async (): Promise<void> => {
  if (!cachedOptions || !currentContainer) {
    return;
  }

  await initializeBookContentVirtualizer({ ...cachedOptions, container: currentContainer });

  if (cachedOptions.onContentChanged && virtualizer) {
    const mounted = getMountedChapters();
    if (mounted.length > 0) {
      cachedOptions.onContentChanged(mounted);
    }
  }
};
