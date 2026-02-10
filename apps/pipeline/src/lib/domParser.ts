import { JSDOM } from "jsdom";

let initialized = false;

export function ensureDomParser(): void {
  if (typeof (globalThis as { DOMParser?: unknown }).DOMParser !== "undefined") {
    return;
  }
  if (initialized) {
    return;
  }

  const { window } = new JSDOM("");
  (globalThis as { DOMParser: typeof window.DOMParser }).DOMParser = window.DOMParser;
  (globalThis as { XMLSerializer: typeof window.XMLSerializer }).XMLSerializer =
    window.XMLSerializer;
  initialized = true;
}
