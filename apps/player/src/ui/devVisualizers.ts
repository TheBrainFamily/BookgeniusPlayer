export type RectBox = { left: number; top: number; width: number; height: number };

const ACTIVE_ELEMENT_VISUALIZER_ID = "dev-zone-visualizer";
const RANGE_VISUALIZER_ID = "dev-zone-visualizer-2";

/** Apply a rectangle (viewport coords) to an overlay. If rect is null, hide. */
function setRect(el: HTMLDivElement, rect: RectBox | null) {
  if (!el) return;

  if (!rect) {
    el.style.opacity = "0";
    return;
  }

  // Round to reduce sub-pixel flicker
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

/** Shared overlay styles. Fixed to viewport, click-through. */
function applyBaseStyles(el: HTMLDivElement) {
  el.style.position = "fixed";
  el.style.pointerEvents = "none";
  el.style.willChange = "width, height, transform, opacity";
  el.style.opacity = "0";
  el.style.transition = "opacity 0.18s ease-out";
}

/** Create a visualizer overlay with given style. */
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

export function createActiveElementVisualizer(): HTMLDivElement {
  return createVisualizer(ACTIVE_ELEMENT_VISUALIZER_ID, { zIndex: 45, border: "2px solid #ff6b6b", background: "rgba(255, 107, 107, 0.08)" });
}

export function createRangeVisualizer(): HTMLDivElement {
  return createVisualizer(RANGE_VISUALIZER_ID, { zIndex: 44, border: "2px dashed #4ecdc4", background: "rgba(78, 205, 196, 0.06)", borderStyle: "dashed" });
}

/** Initialize (or reuse) both overlays. */
export function initializeDevZoneVisualizers(): { activeElementVisualizer: HTMLDivElement | null; rangeVisualizer: HTMLDivElement | null } {
  let activeElementVisualizer = document.getElementById(ACTIVE_ELEMENT_VISUALIZER_ID) as HTMLDivElement | null;
  let rangeVisualizer = document.getElementById(RANGE_VISUALIZER_ID) as HTMLDivElement | null;

  if (!activeElementVisualizer) activeElementVisualizer = createActiveElementVisualizer();
  if (!rangeVisualizer) rangeVisualizer = createRangeVisualizer();

  return { activeElementVisualizer, rangeVisualizer };
}

/** Compute a "visual" rect for an element (includes margins). */
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

/** Draw the full focus-zone overlay with provided vertical bounds. */
export function drawFocusZone(rangeVisualizer: HTMLDivElement | null, rootEl: HTMLElement, focusZoneTop: number, focusZoneBottom: number) {
  if (!rangeVisualizer) return;

  const rootRect = rootEl.getBoundingClientRect();
  const box: RectBox = { left: rootRect.left, top: focusZoneTop, width: rootRect.width, height: Math.max(0, focusZoneBottom - focusZoneTop) };
  setRect(rangeVisualizer, box);
}

/** Draw the active element overlay (or hide when `el` is null). */
export function drawActiveElement(activeVisualizer: HTMLDivElement | null, el: Element | null) {
  if (!activeVisualizer) return;

  if (!el) {
    setRect(activeVisualizer, null);
    return;
  }

  setRect(activeVisualizer, computeElementVisualRect(el));
}

/** Hide any overlay. */
export function hideVisualizer(el: HTMLDivElement | null) {
  if (!el) return;

  setRect(el, null);
}

/**
 * Compute the union rect (viewport coords) that encompasses all given elements.
 * Returns null for empty iterables.
 */
export function computeElementsUnionRect(elements: Iterable<Element>): RectBox | null {
  let minTop = Infinity;
  let maxBottom = -Infinity;
  let minLeft = Infinity;
  let maxRight = -Infinity;
  let any = false;

  for (const el of elements) {
    const vr = computeElementVisualRect(el);
    minTop = Math.min(minTop, vr.top);
    minLeft = Math.min(minLeft, vr.left);
    maxBottom = Math.max(maxBottom, vr.top + vr.height);
    maxRight = Math.max(maxRight, vr.left + vr.width);
    any = true;
  }

  if (!any) return null;

  const width = Math.max(0, maxRight - minLeft);
  const height = Math.max(0, maxBottom - minTop);

  return { left: minLeft, top: minTop, width, height };
}

/**
 * Draw (immediately) the overlay that encompasses all provided elements.
 * Hides the visualizer if the collection is empty.
 * RAF to avoid layout thrash when called from intersection callbacks / scroll handlers
 */
export function drawElementsUnion(rangeVisualizer: HTMLDivElement | null, elements: Iterable<Element>) {
  if (!rangeVisualizer) return;

  requestAnimationFrame(() => {
    const rect = computeElementsUnionRect(elements);
    setRect(rangeVisualizer, rect);
  });
}
