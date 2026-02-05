import { JSDOM } from "jsdom";

/**
 * Re-structures FictionBook chapters written as:
 *   <p><strong>Chapter title…</strong></p>
 * into proper nested structure:
 *   <section>                         ← wrapper (per original flat section)
 *     <section><title><p>…</p></title>…</section>
 *     <section><title><p>…</p></title>…</section>
 *   </section>
 *
 * • If the XML already contains <section><title>, it returns the input untouched.
 * • All nodes are created inside the original default namespace, so there are no
 *   extra `xmlns=""` attributes.
 *
 * A helper `minifyXml()` is exported to make string‑based Jest comparisons
 * whitespace‑agnostic.
 */
export function wrapChaptersWithSections(xml: string): string {
  const dom = new JSDOM(xml, { contentType: "text/html" });
  const doc = dom.window.document;

  const NS = doc.documentElement.namespaceURI || null;

  // Fast‑exit: already structured? -> return untouched
  if (doc.querySelector("section > title")) return xml;

  const body = doc.querySelector("body");
  if (!body) return xml;

  const originalSections = Array.from(body.children).filter((el) => el.localName === "section");

  originalSections.forEach((origSection) => {
    const newSections: Element[] = [];
    let currentSection: Element | null = null;

    Array.from(origSection.childNodes).forEach((node) => {
      const isMarker =
        node.nodeType === dom.window.Node.ELEMENT_NODE &&
        (node as Element).localName === "p" &&
        (node as Element).firstElementChild?.localName === "strong";

      if (isMarker) {
        // ─── new logical chapter ────────────────────────────────
        currentSection = doc.createElementNS(NS, "section");

        const strong = (node as Element).firstElementChild as Element;
        const titleEl = doc.createElementNS(NS, "title");
        const pEl = doc.createElementNS(NS, "p");
        pEl.textContent = strong.textContent ?? "";
        titleEl.appendChild(pEl);
        currentSection.appendChild(titleEl);

        newSections.push(currentSection);
        return; // skip original marker <p>
      }

      // subsequent nodes belong to current chapter
      if (currentSection) {
        currentSection.appendChild(node.cloneNode(true));
      }
    });

    if (newSections.length) {
      const parent = origSection.parentNode!;
      const wrapper = doc.createElementNS(NS, "section");
      newSections.forEach((sec) => wrapper.appendChild(sec));
      parent.insertBefore(wrapper, origSection);
      parent.removeChild(origSection);
    }
  });

  return dom.serialize();
}
