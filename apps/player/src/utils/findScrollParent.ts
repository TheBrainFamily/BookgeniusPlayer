const scrollableOverflowValues = new Set(["auto", "scroll", "overlay"]);

export const findScrollParent = (el: HTMLElement | null): HTMLElement | null => {
  if (typeof window === "undefined" || !el) {
    return null;
  }

  let current = el.parentElement;

  while (current) {
    const style = window.getComputedStyle(current);
    if (scrollableOverflowValues.has(style.overflowY) && current.scrollHeight > current.clientHeight + 1) {
      return current;
    }
    current = current.parentElement;
  }

  const scrollingElement = document.scrollingElement;
  return scrollingElement instanceof HTMLElement ? scrollingElement : document.documentElement;
};
