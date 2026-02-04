import { DOMParser, type Element as XMLElement } from "@xmldom/xmldom";
import { JSDOM } from "jsdom";

function slugifyTagName(tagName: string): string {
  return tagName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findFirstId(element: XMLElement): string | null {
  const walker = element.getElementsByTagName("*");
  for (let i = 0; i < walker.length; i += 1) {
    const node = walker.item(i) as XMLElement | null;
    const id = node?.getAttribute("id");
    if (id) return id;
  }
  return null;
}

function getTalkingTags(p: XMLElement): XMLElement[] {
  const all = p.getElementsByTagName("*");
  const result: XMLElement[] = [];
  for (let i = 0; i < all.length; i += 1) {
    const node = all.item(i) as XMLElement | null;
    if (node && node.getAttribute("talking") === "true") {
      result.push(node);
    }
  }
  return result;
}

export function extractMultiSpeakerNextLineMapFromXml(xml: string): Map<string, string[]> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/html");
  const paragraphs = Array.from(doc.getElementsByTagName("p")) as XMLElement[];
  const map = new Map<string, string[]>();

  for (let i = 0; i < paragraphs.length; i += 1) {
    const p = paragraphs[i];
    const talking = getTalkingTags(p);
    if (talking.length < 2) continue;
    if (p.getElementsByTagName("strong").length === 0) continue;

    const speakers = Array.from(
      new Set(talking.map((node) => slugifyTagName(node.tagName))),
    ).filter(Boolean);
    if (speakers.length < 2) continue;

    let nextId: string | null = null;
    for (let j = i + 1; j < paragraphs.length; j += 1) {
      nextId = findFirstId(paragraphs[j]);
      if (nextId) break;
    }

    if (nextId) {
      map.set(nextId, speakers);
    }
  }

  return map;
}

export function applyMultiSpeakerMapToHtml(html: string, map: Map<string, string[]>): string {
  if (map.size === 0) return html;

  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const speakerBlocks = Array.from(doc.querySelectorAll("div[data-speaker][data-label]"));
  let didFix = false;

  for (const block of speakerBlocks) {
    const firstId = block.querySelector("[id]")?.getAttribute("id") ?? null;
    if (!firstId) continue;
    const speakers = map.get(firstId);
    if (!speakers || speakers.length < 2) continue;
    const joined = speakers.join(" ");
    if (block.getAttribute("data-speaker") !== joined) {
      block.setAttribute("data-speaker", joined);
      didFix = true;
    }
  }

  return didFix ? doc.body.innerHTML : html;
}
