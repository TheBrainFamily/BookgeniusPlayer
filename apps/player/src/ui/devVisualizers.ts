type RectBox = { left: number; top: number; width: number; height: number };

/**
 * Apply a rectangle (in viewport coordinates) to the overlay element.
 * If rect is null -> hide overlay by setting opacity to 0 (kept in DOM to avoid re-creation).
 */
function setRect(el: HTMLDivElement, rect: RectBox | null) {
  if (!el) return;

  if (!rect) {
    el.style.opacity = "0";
    return;
  }

  // Round values to prevent 1px flicker due to sub-pixel scrolling/layout.
  const left = Math.round(rect.left);
  const top = Math.round(rect.top);
  const width = Math.max(0, Math.round(rect.width));
  const height = Math.max(0, Math.round(rect.height));

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.opacity = "1";
}

/** Base, shared overlay styles (fixed to viewport, no pointer events). */
function applyBaseStyles(el: HTMLDivElement) {
  el.style.position = "fixed"; // Viewport-based box, independent of page scroll
  el.style.pointerEvents = "none"; // Click-through
  el.style.willChange = "width, height, transform, opacity";
  el.style.opacity = "0"; // Start hidden
  el.style.transition = "opacity 0.18s ease-out";
}

/**
 * Small factory that creates an overlay with given visual style.
 * Keeps the code DRY for active element & focus zone overlays.
 */
function createVisualizer(id: string, opts: { zIndex: number; border: string; background: string; borderStyle?: string }): HTMLDivElement {
  const box = document.createElement("div");
  box.id = id;
  applyBaseStyles(box);
  box.style.zIndex = String(opts.zIndex);
  box.style.border = opts.border;
  if (opts.borderStyle) box.style.borderStyle = opts.borderStyle;
  box.style.backgroundColor = opts.background;
  document.body.appendChild(box);
  return box;
}

function createActiveElementVisualizer(): HTMLDivElement {
  return createVisualizer("dev-zone-visualizer", { zIndex: 45, border: "2px solid #ff6b6b", background: "rgba(255, 107, 107, 0.08)" });
}

function createRangeVisualizer(): HTMLDivElement {
  return createVisualizer("dev-zone-visualizer-2", { zIndex: 44, border: "2px dashed #4ecdc4", background: "rgba(78, 205, 196, 0.06)", borderStyle: "dashed" });
}

/**
 * Initializes (or reuses) the two developer overlays.
 * Returns nulls if visualizers are disabled.
 */
export function initializeDevZoneVisualizers(): { activeElementVisualizer: HTMLDivElement | null; rangeVisualizer: HTMLDivElement | null } {
  let activeElementVisualizer = document.getElementById("dev-zone-visualizer") as HTMLDivElement | null;
  let rangeVisualizer = document.getElementById("dev-zone-visualizer-2") as HTMLDivElement | null;

  if (!activeElementVisualizer) activeElementVisualizer = createActiveElementVisualizer();
  if (!rangeVisualizer) rangeVisualizer = createRangeVisualizer();

  return { activeElementVisualizer, rangeVisualizer };
}

/**
 * Computes a "visual" rectangle for an element in viewport coordinates.
 * We include margins so the highlight matches what the eye perceives on screen.
 */
export function computeElementVisualRect(el: Element): RectBox {
  const r = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);
  const mt = parseFloat(cs.marginTop);
  const mb = parseFloat(cs.marginBottom);
  const ml = parseFloat(cs.marginLeft);
  const mr = parseFloat(cs.marginRight);

  const visualTop = r.top - mt;
  const visualBottom = r.bottom + mb;
  const visualLeft = r.left - ml;
  const visualRight = r.right + mr;

  return { left: visualLeft, top: visualTop, width: visualRight - visualLeft, height: visualBottom - visualTop };
}

/**
 * Draws the full focus-zone overlay.
 * Uses the content container's rect for left/width, and the provided vertical bounds.
 */
export function drawFocusZone(rangeVisualizer: HTMLDivElement | null, rootEl: HTMLElement, focusZoneTop: number, focusZoneBottom: number) {
  if (!rangeVisualizer) return;

  const rootRect = rootEl.getBoundingClientRect();
  const box: RectBox = { left: rootRect.left, top: focusZoneTop, width: rootRect.width, height: Math.max(0, focusZoneBottom - focusZoneTop) };

  setRect(rangeVisualizer, box);
}

/**
 * Draws the active element overlay (or hides it when `el` is null).
 * Keep this cheap: the heavy lifting (rect calc) is a single getBoundingClientRect.
 */
export function drawActiveElement(activeVisualizer: HTMLDivElement | null, el: Element | null) {
  if (!activeVisualizer) return;
  if (!el) {
    setRect(activeVisualizer, null);
    return;
  }
  setRect(activeVisualizer, computeElementVisualRect(el));
}

/** Hides the given overlay. */
export function hideVisualizer(el: HTMLDivElement | null) {
  if (!el) return;
  setRect(el, null);
}
