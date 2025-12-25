import { bookIndex } from "@player/logic/BookIndex";
import { scrollCoordinator, debugLog } from "@player/services/ScrollCoordinator";
import { hydrateInlineAvatarsInSection } from "@player/ui/activateMediaInRange";
import { highlightCharacter } from "@player/ui/highlightCharacter";

console.log("[BookContentVirtualizer] BookContentVirtualizer version NOV28-v3 (refactored)");

type ContentChangedCallback = (mountedChapters: number[]) => void;

// ============================================================================
// Helper: TopSpacer
// ============================================================================

class TopSpacer {
  private element: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.element = this.ensureElement(host);
  }

  private ensureElement(host: HTMLElement): HTMLDivElement {
    const existing = host.querySelector<HTMLDivElement>("#virtual-top-spacer");
    if (existing) return existing;

    const spacer = document.createElement("div");
    spacer.id = "virtual-top-spacer";
    spacer.style.height = "0px";
    spacer.style.width = "100%";
    spacer.style.pointerEvents = "none";
    spacer.style.flexShrink = "0";
    spacer.style.setProperty("overflow-anchor", "none");
    host.insertBefore(spacer, host.firstChild);
    return spacer;
  }

  get height(): number {
    const h = parseFloat(this.element.style.height || "0");
    return Number.isFinite(h) ? h : 0;
  }

  set height(value: number) {
    const normalized = Math.max(0, Math.round(value));
    const oldHeight = parseFloat(this.element.style.height || "0");
    if (Math.abs(normalized - oldHeight) > 1) {
      console.log("[Spacer] height changed", { from: oldHeight, to: normalized, stack: new Error().stack?.split("\n").slice(2, 5).join(" <- ") });
    }
    this.element.style.height = `${normalized}px`;
  }

  adjustBy(delta: number): void {
    this.height = this.height + delta;
  }

  get domElement(): HTMLDivElement {
    return this.element;
  }
}

// ============================================================================
// Helper: DOM Measurement Utilities
// ============================================================================

function getOuterHeight(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const styles = window.getComputedStyle(el);
  const mt = parseFloat(styles.marginTop) || 0;
  const mb = parseFloat(styles.marginBottom) || 0;
  return rect.height + mt + mb;
}

function getRelativeTop(el: HTMLElement, containerRect: DOMRect): number {
  return el.getBoundingClientRect().top - containerRect.top;
}

function parseChapterId(wrapper: HTMLElement): number | null {
  const attr = wrapper.getAttribute("data-chapter-wrapper");
  if (!attr) return null;
  const id = parseInt(attr, 10);
  return Number.isFinite(id) ? id : null;
}

// ============================================================================
// Helper: Scroll Compensation
// ============================================================================

interface CompensationContext {
  contentContainer: HTMLElement | null;
  containerRect: DOMRect | null;
  topSpacer: TopSpacer;
}

function compensateForPrepend(ctx: CompensationContext, anchorElement: HTMLElement, beforeTop: number, chapterId: number): void {
  const { contentContainer, containerRect, topSpacer } = ctx;
  if (!containerRect) return;

  const afterTop = getRelativeTop(anchorElement, containerRect);
  const delta = afterTop - beforeTop;

  if (delta === 0) return;

  const currentSpacerHeight = topSpacer.height;
  const newSpacerHeight = currentSpacerHeight - delta;

  if (newSpacerHeight >= 0) {
    topSpacer.height = newSpacerHeight;
    debugLog("compensateForPrepend via spacer", { chapterId, delta, newSpacerHeight });
    return;
  }

  // Spacer can't go negative - adjust scroll position directly
  topSpacer.height = 0;
  const remainingDelta = delta - currentSpacerHeight;

  if (contentContainer) {
    const currentScrollTop = contentContainer.scrollTop;
    const newScrollTop = currentScrollTop + remainingDelta;
    contentContainer.scrollTop = newScrollTop;
    debugLog("compensateForPrepend via scroll", { chapterId, delta, currentSpacerHeight, remainingDelta, scrollAdjust: `${currentScrollTop} -> ${newScrollTop}` });
  }
}

function compensateForRemoval(ctx: CompensationContext, anchorElement: HTMLElement | null, anchorTopBefore: number | null): void {
  const { containerRect, topSpacer } = ctx;
  if (!anchorElement || !containerRect || anchorTopBefore === null) return;

  const anchorTopAfter = getRelativeTop(anchorElement, containerRect);
  const delta = anchorTopAfter - anchorTopBefore;

  if (delta !== 0) {
    topSpacer.adjustBy(-delta);
    debugLog("compensateForRemoval anchor correction", { delta, newSpacerHeight: topSpacer.height });
  }
}

// ============================================================================
// Main Class: ChapterVirtualizer
// ============================================================================

class ChapterVirtualizer {
  private mountedChapters: number[] = [];
  private topSpacer: TopSpacer;

  constructor(
    private host: HTMLElement,
    private onContentChanged?: ContentChangedCallback,
  ) {
    this.topSpacer = new TopSpacer(host);
  }

  ensureWindow(targetChapter: number, forceRemount = false): void {
    debugLog("ensureWindow called", { targetChapter, forceRemount, currentMounted: this.mountedChapters });

    const normalizedTarget = this.normalizeTargetChapter(targetChapter);
    if (normalizedTarget === null) return;

    const desiredChapters = this.computeDesiredWindow(normalizedTarget);
    // Normal window mode: keep spacers for proper chapter transitions
    this.ensureChapters(desiredChapters, forceRemount, { stripSpacers: false });
  }

  /**
   * Ensure that *all* chapters in [startChapter, endChapter] are mounted.
   * Used for long-distance navigations with smooth scrolling so the user
   * sees continuous content between source and target.
   */
  ensureRange(startChapter: number, endChapter: number, forceRemount = false): void {
    debugLog("ensureRange called", { startChapter, endChapter, forceRemount, currentMounted: this.mountedChapters });

    if (!Number.isFinite(startChapter) || !Number.isFinite(endChapter)) return;

    const first = bookIndex.getFirstChapter();
    const last = bookIndex.getLastChapter();
    if (first === null || last === null) return;

    const from = Math.max(Math.min(startChapter, endChapter), first);
    const to = Math.min(Math.max(startChapter, endChapter), last);
    if (from > to) return;

    const desiredChapters: number[] = [];
    for (let chapterId = from; chapterId <= to; chapterId++) {
      if (bookIndex.hasChapter(chapterId)) {
        desiredChapters.push(chapterId);
      }
    }

    if (desiredChapters.length === 0) return;

    // Range mode: strip spacers from newly mounted chapters to avoid visual gaps during smooth scroll
    this.ensureChapters(desiredChapters, forceRemount, { stripSpacers: true });
  }

  /**
   * Core driver for applying a specific set of chapters to the DOM,
   * with spacer/scroll compensation. Used by both ensureWindow and ensureRange.
   */
  private ensureChapters(desiredChapters: number[], forceRemount: boolean, options: { stripSpacers: boolean } = { stripSpacers: false }): void {
    const contentContainer = this.host.closest<HTMLElement>("#content-container");
    const containerRect = contentContainer?.getBoundingClientRect() ?? null;

    const ctx: CompensationContext = { contentContainer, containerRect, topSpacer: this.topSpacer };

    // Disable browser scroll anchoring during mutations
    const originalOverflowAnchor = contentContainer?.style.overflowAnchor;
    if (contentContainer) {
      contentContainer.style.overflowAnchor = "none";
    }

    try {
      const existingWrappers = this.getExistingWrappers();
      this.removeStaleChapters(ctx, existingWrappers, desiredChapters, forceRemount);
      this.mountMissingChapters(ctx, existingWrappers, desiredChapters, options.stripSpacers);
      this.updateMountedState(desiredChapters, forceRemount);
    } finally {
      if (contentContainer) {
        contentContainer.style.overflowAnchor = originalOverflowAnchor ?? "";
      }
    }
  }

  private normalizeTargetChapter(targetChapter: number): number | null {
    if (bookIndex.hasChapter(targetChapter)) {
      return targetChapter;
    }

    const first = bookIndex.getFirstChapter();
    const last = bookIndex.getLastChapter();

    if (first === null || last === null) return null;

    if (targetChapter < first) return first;
    if (targetChapter > last) return last;

    return Math.max(first, Math.min(last, targetChapter));
  }

  private computeDesiredWindow(targetChapter: number): number[] {
    const candidates = [targetChapter - 1, targetChapter, targetChapter + 1];
    return candidates.filter((id) => bookIndex.hasChapter(id)).sort((a, b) => a - b);
  }

  private getExistingWrappers(): Map<number, HTMLElement> {
    const wrappers = Array.from(this.host.querySelectorAll<HTMLElement>("[data-chapter-wrapper]"));
    const existing = new Map<number, HTMLElement>();

    for (const wrapper of wrappers) {
      const chapterId = parseChapterId(wrapper);
      if (chapterId !== null) {
        existing.set(chapterId, wrapper);
      }
    }

    return existing;
  }

  private removeStaleChapters(ctx: CompensationContext, existingWrappers: Map<number, HTMLElement>, desiredChapters: number[], forceRemount: boolean): void {
    const desiredSet = new Set(desiredChapters);
    const { toRemoveAbove, toRemoveBelow } = this.categorizeWrappersToRemove(ctx, existingWrappers, desiredSet, forceRemount);

    if (toRemoveAbove.length === 0 && toRemoveBelow.length === 0) return;

    // Suppress scroll direction tracking during DOM mutations to avoid inconsistent state
    scrollCoordinator.setSuppressTracking(true);

    try {
      // Find anchor for scroll compensation - prefer first desired chapter (target) as anchor
      const preferredAnchorId = desiredChapters[0];
      let anchor = existingWrappers.get(preferredAnchorId) ?? null;

      // Fallback to finding first non-removed wrapper if preferred anchor not found
      if (!anchor) {
        const removingAboveSet = new Set(toRemoveAbove);
        anchor = this.findAnchorWrapper(removingAboveSet);
      }

      scrollCoordinator.forceReflow(this.host);

      const anchorTopBefore = anchor && ctx.containerRect ? getRelativeTop(anchor, ctx.containerRect) : null;

      debugLog("removeStaleChapters", { toRemoveAbove: toRemoveAbove.length, toRemoveBelow: toRemoveBelow.length, anchorTopBefore, preferredAnchorId });

      // Adjust spacer before removing chapters above
      if (toRemoveAbove.length > 0) {
        const removedHeight = toRemoveAbove.reduce((sum, w) => sum + getOuterHeight(w), 0);
        this.topSpacer.adjustBy(removedHeight);
        debugLog("removeStaleChapters spacer adjusted", { removedHeight, newSpacerHeight: this.topSpacer.height });
      }

      // Remove elements
      for (const wrapper of toRemoveAbove) {
        const id = parseChapterId(wrapper);
        wrapper.remove();
        if (id !== null) existingWrappers.delete(id);
      }

      for (const wrapper of toRemoveBelow) {
        const id = parseChapterId(wrapper);
        wrapper.remove();
        if (id !== null) existingWrappers.delete(id);
      }

      scrollCoordinator.forceReflow(this.host);

      // Correct any mismatch from removal
      compensateForRemoval(ctx, anchor, anchorTopBefore);
    } finally {
      // Re-enable scroll direction tracking
      scrollCoordinator.setSuppressTracking(false);
    }
  }

  private categorizeWrappersToRemove(
    ctx: CompensationContext,
    existingWrappers: Map<number, HTMLElement>,
    desiredSet: Set<number>,
    forceRemount: boolean,
  ): { toRemoveAbove: HTMLElement[]; toRemoveBelow: HTMLElement[] } {
    const toRemoveAbove: HTMLElement[] = [];
    const toRemoveBelow: HTMLElement[] = [];
    const { containerRect } = ctx;

    if (!containerRect) {
      // Fast path: no measurements needed, put all in below
      for (const [chapterId, wrapper] of existingWrappers) {
        if (forceRemount || !desiredSet.has(chapterId)) {
          toRemoveBelow.push(wrapper);
        }
      }
      return { toRemoveAbove, toRemoveBelow };
    }

    // Collect all wrappers that need to be removed
    const toMeasure: Array<[number, HTMLElement]> = [];
    for (const [chapterId, wrapper] of existingWrappers) {
      if (forceRemount || !desiredSet.has(chapterId)) {
        toMeasure.push([chapterId, wrapper]);
      }
    }

    if (toMeasure.length === 0) {
      return { toRemoveAbove, toRemoveBelow };
    }

    // Batch read all rects in a single pass (single reflow)
    const rects = toMeasure.map(([_, wrapper]) => wrapper.getBoundingClientRect());

    // Process with cached measurements
    const margin = 200;
    for (let i = 0; i < toMeasure.length; i++) {
      const [_, wrapper] = toMeasure[i];
      const rect = rects[i];

      const fullyAbove = rect.bottom <= containerRect.top - margin;
      const fullyBelow = rect.top >= containerRect.bottom + margin;

      // Only remove if fully off-screen (unless forceRemount)
      if (forceRemount || fullyAbove || fullyBelow) {
        if (rect.bottom <= containerRect.top) {
          toRemoveAbove.push(wrapper);
        } else {
          toRemoveBelow.push(wrapper);
        }
      }
    }

    return { toRemoveAbove, toRemoveBelow };
  }

  private findAnchorWrapper(excludeSet: Set<HTMLElement>): HTMLElement | null {
    let node = this.topSpacer.domElement.nextElementSibling as HTMLElement | null;

    while (node) {
      if (node.hasAttribute?.("data-chapter-wrapper") && !excludeSet.has(node)) {
        return node;
      }
      node = node.nextElementSibling as HTMLElement | null;
    }

    return null;
  }

  private mountMissingChapters(ctx: CompensationContext, existingWrappers: Map<number, HTMLElement>, desiredChapters: number[], stripSpacers: boolean = false): void {
    const currentlyInDom = new Set<number>(existingWrappers.keys());

    for (const chapterId of desiredChapters) {
      if (existingWrappers.has(chapterId)) continue;

      const element = bookIndex.cloneChapterWrapper(chapterId);

      // Remove transition spacers from newly mounted chapters during range-based navigation
      // This prevents 100vh empty gaps from appearing during smooth scroll
      if (stripSpacers) {
        const spacer = element.querySelector(".transition-spacer");
        spacer?.remove();
      }

      existingWrappers.set(chapterId, element);

      const insertionPoint = this.findInsertionPoint(currentlyInDom, existingWrappers, chapterId);

      if (insertionPoint) {
        this.insertWithCompensation(ctx, element, insertionPoint, chapterId);
      } else {
        this.host.appendChild(element);
      }

      currentlyInDom.add(chapterId);
    }
  }

  private findInsertionPoint(currentlyInDom: Set<number>, existingWrappers: Map<number, HTMLElement>, chapterId: number): HTMLElement | null {
    const sortedInDom = Array.from(currentlyInDom).sort((a, b) => a - b);
    const nextHigherChapter = sortedInDom.find((ch) => ch > chapterId);

    if (nextHigherChapter === undefined) return null;

    return existingWrappers.get(nextHigherChapter) ?? null;
  }

  private insertWithCompensation(ctx: CompensationContext, element: HTMLElement, insertBefore: HTMLElement, chapterId: number): void {
    const { containerRect } = ctx;

    scrollCoordinator.forceReflow(this.host);

    const beforeTop = containerRect ? getRelativeTop(insertBefore, containerRect) : null;

    this.host.insertBefore(element, insertBefore);

    scrollCoordinator.forceReflow(this.host);

    if (beforeTop !== null) {
      compensateForPrepend(ctx, insertBefore, beforeTop, chapterId);
    }
  }

  private updateMountedState(desiredChapters: number[], forceRemount: boolean): void {
    if (!forceRemount && this.arraysEqual(this.mountedChapters, desiredChapters)) {
      debugLog("ensureWindow no change in mounted chapters");
      return;
    }

    const nowWrappers = Array.from(this.host.querySelectorAll<HTMLElement>("[data-chapter-wrapper]"));
    this.mountedChapters = nowWrappers
      .map((w) => parseChapterId(w))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);

    debugLog("ensureWindow complete", { mountedChapters: this.mountedChapters, spacerHeight: this.topSpacer.height });

    this.onContentChanged?.([...this.mountedChapters]);
  }

  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  destroy(): void {
    this.host.replaceChildren();
    this.mountedChapters = [];
  }

  getMountedChapters(): number[] {
    return [...this.mountedChapters];
  }
}

// ============================================================================
// Module Exports
// ============================================================================

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
  console.log("[Virtualizer] ensureChapterWindow called", { chapterId, force: options.force, stack: new Error().stack?.split("\n").slice(1, 4).join(" <- ") });

  if (!virtualizer || !chaptersHost) {
    await ensureInitializationPromise();
  }

  if (!virtualizer) {
    throw new Error("[BookContentVirtualizer] ensureChapterWindow called before initialization.");
  }

  virtualizer.ensureWindow(chapterId, options.force ?? false);
};

export const ensureChapterRangeWindow = async (startChapter: number, endChapter: number, options: { force?: boolean } = {}): Promise<void> => {
  if (!virtualizer || !chaptersHost) {
    await ensureInitializationPromise();
  }

  if (!virtualizer) {
    throw new Error("[BookContentVirtualizer] ensureChapterRangeWindow called before initialization.");
  }

  virtualizer.ensureRange(startChapter, endChapter, options.force ?? false);
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

/**
 * Update mounted chapters in-place without removing/re-adding DOM nodes.
 * This preserves scroll position naturally since the wrapper elements stay in place.
 * Only the inner section content is replaced.
 */
export const updateMountedChaptersInPlace = (): void => {
  console.log("[Convex:Flow] updateMountedChaptersInPlace called", { chaptersHost: !!chaptersHost, virtualizer: !!virtualizer, currentContainer: !!currentContainer });

  if (!chaptersHost) {
    console.warn("[BookContentVirtualizer] updateMountedChaptersInPlace called before initialization");
    return;
  }

  console.log("[Convex:Flow] chaptersHost element:", chaptersHost.tagName, chaptersHost.id, chaptersHost.className);
  console.log("[Convex:Flow] chaptersHost children count:", chaptersHost.children.length);

  // Query DOM directly for mounted chapter wrappers (don't rely on virtualizer state)
  const wrappers = Array.from(chaptersHost.querySelectorAll<HTMLElement>("[data-chapter-wrapper]"));
  console.log("[Convex:Flow] Found wrappers with [data-chapter-wrapper]:", wrappers.length);

  const mountedChapterIds = wrappers
    .map((w) => {
      const attr = w.getAttribute("data-chapter-wrapper");
      return attr ? parseInt(attr, 10) : null;
    })
    .filter((id): id is number => id !== null && Number.isFinite(id));

  if (mountedChapterIds.length === 0) {
    console.log("[Convex:Flow] No mounted chapters found in DOM");
    return;
  }

  console.log("[Convex:Flow] Updating chapters in-place:", mountedChapterIds);

  for (const chapterId of mountedChapterIds) {
    const existingWrapper = chaptersHost.querySelector<HTMLElement>(`[data-chapter-wrapper="${chapterId}"]`);
    if (!existingWrapper) continue;

    try {
      // Get fresh content from bookIndex
      const freshWrapper = bookIndex.cloneChapterWrapper(chapterId);
      const freshSection = freshWrapper.querySelector<HTMLElement>("section[data-chapter]");
      const existingSection = existingWrapper.querySelector<HTMLElement>("section[data-chapter]");

      if (freshSection && existingSection) {
        // Log first 200 chars of old vs new to detect if content actually changed
        const oldHtml = existingSection.innerHTML;
        const newHtml = freshSection.innerHTML;
        const contentChanged = oldHtml !== newHtml;
        console.log("[Convex:Flow] Chapter", chapterId, "update:", {
          contentChanged,
          oldLength: oldHtml.length,
          newLength: newHtml.length,
          oldPreview: oldHtml.slice(0, 150) + "...",
          newPreview: newHtml.slice(0, 150) + "...",
        });

        // Replace inner HTML only - wrapper stays in place
        existingSection.innerHTML = freshSection.innerHTML;

        // Immediately hydrate avatars and character highlights before browser paints
        hydrateInlineAvatarsInSection(existingSection);
        existingSection.querySelectorAll<HTMLSpanElement>(".character-highlighted").forEach(highlightCharacter);

        console.log("[Convex:Flow] Updated chapter", chapterId, "in-place");
      }
    } catch (e) {
      console.error("[Convex:Flow] Failed to update chapter", chapterId, e);
    }
  }

  console.log("[Convex:Flow] In-place update complete");
};
