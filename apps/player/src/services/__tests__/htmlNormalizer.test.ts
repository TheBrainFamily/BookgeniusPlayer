/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";

function stripCharacterMarkup(html: string): string {
  let result = html.replace(/<span\s+data-c="[^"]*">([^<]*)<\/span>/g, "$1");
  result = result.replace(/\s+data-speaker="[^"]*"/g, "");
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

function compareStructure(original: string, withCharacters: string): { match: boolean; originalNormalized: string; withCharactersNormalized: string } {
  const originalNormalized = stripCharacterMarkup(original);
  const withCharactersNormalized = stripCharacterMarkup(withCharacters);
  return { match: originalNormalized === withCharactersNormalized, originalNormalized, withCharactersNormalized };
}

interface CharacterRef {
  slug: string;
  type: "speaker" | "mention";
  text?: string;
  paragraphIndex?: number;
}

function extractCharacterRefs(html: string): CharacterRef[] {
  const refs: CharacterRef[] = [];
  const speakerRegex = /data-speaker="([^"]*)"/g;
  let match;
  while ((match = speakerRegex.exec(html)) !== null) {
    const slugs = match[1].split(/\s+/).filter(Boolean);
    for (const slug of slugs) {
      refs.push({ slug, type: "speaker" });
    }
  }
  const mentionRegex = /<span\s+data-c="([^"]*)">([^<]*)<\/span>/g;
  while ((match = mentionRegex.exec(html)) !== null) {
    refs.push({ slug: match[1], type: "mention", text: match[2] });
  }
  return refs;
}

function injectDataIndex(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const section = doc.querySelector("section[data-chapter]");
  if (!section) return html;
  let index = 0;
  for (const child of Array.from(section.children)) {
    child.setAttribute("data-index", String(index++));
  }
  return section.outerHTML;
}

function injectAvatarShells(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const section = doc.querySelector("section[data-chapter]");
  if (!section) return html;

  section.querySelectorAll("[data-speaker]").forEach((el) => {
    const speakers = el.getAttribute("data-speaker")?.split(/\s+/) ?? [];
    if (speakers.length === 0) return;
    el.classList.add("has-speaker");
    const shell = doc.createElement("span");
    shell.className = "character-placeholder character-talking start-of-paragraph";
    shell.setAttribute("data-character", speakers[0]);
    shell.setAttribute("data-is-talking", "true");
    el.insertBefore(shell, el.firstChild);
  });

  section.querySelectorAll("span[data-c]").forEach((el) => {
    el.classList.add("character-highlighted");
  });

  return section.outerHTML;
}

function sanitizeHtml(html: string): string {
  const BLOCKED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "link", "meta", "base", "noscript"]);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  for (const tag of BLOCKED_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }

  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      if (name.startsWith("on") || value.includes("javascript:") || value.includes("vbscript:")) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return doc.body.innerHTML;
}

function convertXmlToHtml(xml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const chapter = doc.querySelector("Chapter");
  if (!chapter) throw new Error("No Chapter element found");
  const chapterId = chapter.getAttribute("id") || "1";
  let html = `<section data-chapter="${chapterId}">`;
  for (const child of Array.from(chapter.children)) {
    html += convertElement(child);
  }
  html += "</section>";
  return html;
}

function convertElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (isCharacterTag(el.tagName)) {
    return convertCharacterElement(el);
  }
  switch (tag) {
    case "h3":
    case "h4":
    case "h5":
    case "p":
    case "blockquote":
    case "div":
    case "em":
    case "strong":
    case "br":
      return convertStandardElement(el, tag);
    case "note":
      return convertNote(el);
    case "linebreak":
      return "<br>";
    default:
      return convertStandardElement(el, "div");
  }
}

function isCharacterTag(tagName: string): boolean {
  const standardTags = new Set(["p", "h3", "h4", "h5", "em", "strong", "br", "div", "blockquote", "note", "linebreak", "chapter", "span", "i", "b"]);
  return !standardTags.has(tagName.toLowerCase()) && /^[A-Z]/.test(tagName);
}

function convertCharacterElement(el: Element): string {
  const slug = el.tagName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const isTalking = el.getAttribute("talking") === "true";
  const text = el.textContent || "";

  if (isTalking && !text.trim()) {
    return `__SPEAKER__${slug}__`;
  }
  if (isTalking && text.trim()) {
    return `__SPEAKER__${slug}__<strong>${text}</strong>`;
  }
  if (text.trim()) {
    return `<span data-c="${slug}">${text}</span>`;
  }
  return `__SPEAKER__${slug}__`;
}

function convertStandardElement(el: Element, htmlTag: string): string {
  let inner = "";
  const speakers: string[] = [];

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      inner += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const converted = convertElement(node as Element);
      const speakerMatch = converted.match(/^__SPEAKER__([^_]+)__(.*)$/);
      if (speakerMatch) {
        speakers.push(speakerMatch[1]);
        inner += speakerMatch[2];
      } else {
        inner += converted;
      }
    }
  }

  const attrs: string[] = [];
  if (speakers.length > 0) {
    attrs.push(`data-speaker="${speakers.join(" ")}"`);
  }
  for (const attr of Array.from(el.attributes)) {
    if (["id", "class"].includes(attr.name)) {
      attrs.push(`${attr.name}="${attr.value}"`);
    }
  }

  const attrStr = attrs.length ? " " + attrs.join(" ") : "";
  return `<${htmlTag}${attrStr}>${inner}</${htmlTag}>`;
}

function convertNote(el: Element): string {
  const id = el.getAttribute("id") || "";
  const text = el.textContent || `[${id}]`;
  return `<a data-note="${id}">${text}</a>`;
}

describe("stripCharacterMarkup", () => {
  it("removes data-c spans preserving text", () => {
    const input = '<p>Hello <span data-c="bob">Bob</span>!</p>';
    expect(stripCharacterMarkup(input)).toBe("<p>Hello Bob!</p>");
  });

  it("removes data-speaker attributes", () => {
    const input = '<p data-speaker="bob">Hello world</p>';
    expect(stripCharacterMarkup(input)).toBe("<p>Hello world</p>");
  });

  it("handles multiple characters", () => {
    const input = `<p data-speaker="bob">Hello <span data-c="alice">Alice</span>, said <span data-c="bob">Bob</span>.</p>`;
    expect(stripCharacterMarkup(input)).toBe("<p>Hello Alice, said Bob.</p>");
  });

  it("preserves other HTML structure", () => {
    const input = `<section data-chapter="1"><h4>Title</h4><p data-speaker="x">Text with <em>emphasis</em>.</p></section>`;
    const result = stripCharacterMarkup(input);
    expect(result).toContain("<section data-chapter=");
    expect(result).toContain("<h4>Title</h4>");
    expect(result).toContain("<em>emphasis</em>");
    expect(result).not.toContain("data-speaker");
  });
});

describe("compareStructure", () => {
  it("returns match=true when only character markup differs", () => {
    const original = "<p>Hello Alice, said Bob.</p>";
    const withChars = '<p data-speaker="bob">Hello <span data-c="alice">Alice</span>, said <span data-c="bob">Bob</span>.</p>';
    expect(compareStructure(original, withChars).match).toBe(true);
  });

  it("returns match=false when text content differs", () => {
    const original = "<p>Hello Alice!</p>";
    const withChars = '<p data-speaker="bob">Hello <span data-c="bob">Bob</span>!</p>';
    expect(compareStructure(original, withChars).match).toBe(false);
  });

  it("returns match=false when structure differs", () => {
    const original = "<p>Hello</p><p>World</p>";
    const withChars = "<p>Hello World</p>";
    expect(compareStructure(original, withChars).match).toBe(false);
  });

  it("handles complex nested structures", () => {
    const original = `
      <section data-chapter="1">
        <h4>Chapter One</h4>
        <p>Pan Ignacy od dwudziestu pięciu lat mieszkał w pokoiku przy sklepie.</p>
        <p>— Dzień dobry — rzekł pan Ignacy. — Jak się masz, Klejn?</p>
        <blockquote>Cytat z książki</blockquote>
      </section>
    `;
    const withChars = `
      <section data-chapter="1">
        <h4>Chapter One</h4>
        <p><span data-c="ignacy-rzecki">Pan Ignacy</span> od dwudziestu pięciu lat mieszkał w pokoiku przy sklepie.</p>
        <p data-speaker="ignacy-rzecki">— Dzień dobry — rzekł <span data-c="ignacy-rzecki">pan Ignacy</span>. — Jak się masz, <span data-c="klejn">Klejn</span>?</p>
        <blockquote>Cytat z książki</blockquote>
      </section>
    `;
    expect(compareStructure(original, withChars).match).toBe(true);
  });
});

describe("extractCharacterRefs", () => {
  it("extracts speaker from paragraph", () => {
    const html = '<p data-speaker="bob">Hello</p>';
    const refs = extractCharacterRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ slug: "bob", type: "speaker" });
  });

  it("extracts multiple speakers", () => {
    const html = '<p data-speaker="bob alice">Hello</p>';
    const refs = extractCharacterRefs(html);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({ slug: "bob", type: "speaker" });
    expect(refs[1]).toEqual({ slug: "alice", type: "speaker" });
  });

  it("extracts character mentions", () => {
    const html = '<p>Hello <span data-c="alice">Alice</span>!</p>';
    const refs = extractCharacterRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ slug: "alice", type: "mention", text: "Alice" });
  });

  it("extracts both speakers and mentions", () => {
    const html = `
      <p data-speaker="bob">Hello <span data-c="alice">Alice</span>!</p>
      <p data-speaker="alice">Hi <span data-c="bob">Bob</span>!</p>
    `;
    const refs = extractCharacterRefs(html);
    expect(refs).toHaveLength(4);
    expect(refs.filter((r) => r.type === "speaker")).toHaveLength(2);
    expect(refs.filter((r) => r.type === "mention")).toHaveLength(2);
  });
});

describe("injectDataIndex", () => {
  it("assigns sequential data-index to all direct children", () => {
    const input = `
      <section data-chapter="1">
        <h4>Title</h4>
        <p>Para 1</p>
        <p>Para 2</p>
        <blockquote>Quote</blockquote>
        <div>Div</div>
      </section>
    `;
    const result = injectDataIndex(input);
    expect(result).toContain('data-index="0"');
    expect(result).toContain('data-index="1"');
    expect(result).toContain('data-index="2"');
    expect(result).toContain('data-index="3"');
    expect(result).toContain('data-index="4"');
  });

  it("does not assign data-index to nested elements", () => {
    const input = `<section data-chapter="1"><p>Text with <em>nested</em> element</p></section>`;
    const result = injectDataIndex(input);
    expect(result).toMatch(/<p data-index="0">/);
    expect(result).not.toContain("<em data-index");
  });

  it("handles any element type", () => {
    const input = `
      <section data-chapter="1">
        <custom-element>Custom 1</custom-element>
        <another-tag>Custom 2</another-tag>
        <p>Regular paragraph</p>
      </section>
    `;
    const result = injectDataIndex(input);
    expect(result).toContain('data-index="0"');
    expect(result).toContain('data-index="1"');
    expect(result).toContain('data-index="2"');
  });
});

describe("injectAvatarShells", () => {
  it("injects avatar shell for speaker", () => {
    const input = '<section data-chapter="1"><p data-speaker="bob">Hello</p></section>';
    const result = injectAvatarShells(input);
    expect(result).toContain("character-placeholder");
    expect(result).toContain('data-character="bob"');
    expect(result).toContain('data-is-talking="true"');
  });

  it("adds has-speaker class", () => {
    const input = '<section data-chapter="1"><p data-speaker="bob">Hello</p></section>';
    const result = injectAvatarShells(input);
    expect(result).toContain("has-speaker");
  });

  it("adds character-highlighted to mentions", () => {
    const input = '<section data-chapter="1"><p>Hello <span data-c="bob">Bob</span></p></section>';
    const result = injectAvatarShells(input);
    expect(result).toContain("character-highlighted");
  });

  it("uses first speaker for avatar when multiple", () => {
    const input = '<section data-chapter="1"><p data-speaker="bob alice">Hello</p></section>';
    const result = injectAvatarShells(input);
    expect(result).toContain('data-character="bob"');
  });
});

describe("convertXmlToHtml", () => {
  it("converts Chapter wrapper to section", () => {
    const xml = '<Chapter id="2"><p>Hello</p></Chapter>';
    const html = convertXmlToHtml(xml);
    expect(html).toContain('<section data-chapter="2">');
    expect(html).toContain("</section>");
  });

  it("converts character with talking=true to data-speaker", () => {
    const xml = '<Chapter id="1"><p><Bob talking="true"/>Hello world</p></Chapter>';
    const html = convertXmlToHtml(xml);
    expect(html).toContain('data-speaker="bob"');
  });

  it("converts character reference to data-c span", () => {
    const xml = '<Chapter id="1"><p>Hello <Bob>Bob Smith</Bob>!</p></Chapter>';
    const html = convertXmlToHtml(xml);
    expect(html).toContain('<span data-c="bob">Bob Smith</span>');
  });

  it("converts note to anchor", () => {
    const xml = '<Chapter id="1"><p>Text with<note id="23"></note> footnote</p></Chapter>';
    const html = convertXmlToHtml(xml);
    expect(html).toContain('<a data-note="23">');
  });

  it("preserves blockquotes and other elements", () => {
    const xml = `
      <Chapter id="1">
        <h4>Title</h4>
        <blockquote>A quote</blockquote>
        <p>Normal text</p>
      </Chapter>
    `;
    const html = convertXmlToHtml(xml);
    expect(html).toContain("<h4>Title</h4>");
    expect(html).toContain("<blockquote>A quote</blockquote>");
    expect(html).toContain("<p>Normal text</p>");
  });

  it("handles complex Lalka-style XML", () => {
    const xml = `
      <Chapter id="2">
        <h4>II. Rządy starego subiekta</h4>
        <p><Ignacy-Rzecki>Pan Ignacy</Ignacy-Rzecki> od dwudziestu pięciu lat mieszkał w pokoiku.</p>
        <p><Ignacy-Rzecki talking="true"/>— Dzień dobry — rzekł <Ignacy-Rzecki>pan Ignacy</Ignacy-Rzecki>.</p>
        <p>Tekst z <note id="23"></note> przypisem.</p>
      </Chapter>
    `;
    const html = convertXmlToHtml(xml);
    expect(html).toContain('<section data-chapter="2">');
    expect(html).toContain('<span data-c="ignacy-rzecki">Pan Ignacy</span>');
    expect(html).toContain('data-speaker="ignacy-rzecki"');
    expect(html).toContain('<a data-note="23">');

    const originalText = "Pan Ignacy od dwudziestu pięciu lat mieszkał w pokoiku";
    expect(stripCharacterMarkup(html)).toContain(originalText);
  });

  it("handles multiple speakers in one paragraph", () => {
    const xml = `
      <Chapter id="1">
        <p><Bob talking="true"/><Alice talking="true"/>— Hello! — they said.</p>
      </Chapter>
    `;
    const html = convertXmlToHtml(xml);
    expect(html).toContain('data-speaker="bob alice"');
  });
});

describe("sanitizeHtml", () => {
  it("removes script tags", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Hello</p>");
    expect(result).toContain("<p>World</p>");
  });

  it("removes onclick attributes", () => {
    const html = '<p onclick="alert(1)">Click me</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onclick");
    expect(result).toContain("<p>Click me</p>");
  });

  it("removes javascript: URLs", () => {
    const html = '<a href="javascript:alert(1)">Link</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("javascript:");
  });

  it("preserves safe content", () => {
    const html = `
      <section data-chapter="1">
        <h4>Title</h4>
        <p data-speaker="bob">Hello <em>world</em>!</p>
        <blockquote>A quote with <strong>bold</strong></blockquote>
      </section>
    `;
    const result = sanitizeHtml(html);
    expect(result).toContain("data-chapter=");
    expect(result).toContain("data-speaker=");
    expect(result).toContain("<em>world</em>");
    expect(result).toContain("<blockquote>");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("removes iframe tags", () => {
    const html = '<p>Text</p><iframe src="evil.com"></iframe>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>Text</p>");
  });
});
