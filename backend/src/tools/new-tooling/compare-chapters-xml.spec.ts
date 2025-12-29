import { describe, test, expect } from "vitest";
import { compareXmlTextContent, restoreOriginalText } from "./compare-chapters-xml";

// const restoreOriginalText = (original: string, changed: string, tagNames: string[]) => {
//   return "";
// };

test("compare chapters xml", () => {
  const original = `<p>Hi there</p>`;
  const changed = `<p>Hi there</p>`;
  const restored = restoreOriginalText(original, changed, []);

  expect(compareXmlTextContent(original, restored)).toBe(true);
});

// __tests__/restoreOriginalText.spec.ts
import { DOMParser } from "@xmldom/xmldom";
import * as Diff from "diff";

const tagNames = ["Ksiaze-Ramzes", "Nikotris", "Sara", "Herhor"];

/* small helper: strip our tags & squash whitespace ----------------------- */
function plain(xml: string): string {
  const tagRe = new RegExp(`<\\/?(?:${tagNames.join("|")})(?:\\s[^>]*?)?>`, "g");
  return xml.replace(tagRe, "").replace(/\s+/g, " ").trim();
}

/* quick sanity: is it still well-formed XML? ----------------------------- */
function isValidXml(xml: string): boolean {
  const dom = new DOMParser().parseFromString(xml, "text/xml");
  return !dom.getElementsByTagName("parsererror").length;
}

describe("restoreOriginalText – integration tests", () => {
  test("case 1 · single-tag + 1-char drift", () => {
    const original = `
      <Chapter id="1"><p>Spotkał Sarę w ogrodzie.</p></Chapter>`;

    const modelOut = `
      <Chapter id="1"><p>Spotkał <Sara>Sarę</Sara> w ogrozie.</p></Chapter>`;

    const patched = restoreOriginalText(original, modelOut, tagNames);

    expect(plain(patched)).toBe(plain(original)); // prose identical
    expect(patched).toMatch(/<Sara>.*?<\/Sara>/); // tag survived
    expect(isValidXml(patched)).toBe(true); // well-formed
  });

  test("case 2 · multiple tags + tiny drift in middle", () => {
    const original = `
      <p>Dopiero czwarty syn, Ramzes, 
         urodzony z Nikotris, był silny.</p>`;

    const modelOut = `
      <p>Dopiero czwarty syn, <Ksiaze-Ramzes>Ramzes</Ksiaze-Ramzes>, 
         urodzony z <Nikotris>Nikotris</Nikotris>, był silnny.</p>`; // “silny” → “silnny”

    const patched = restoreOriginalText(original, modelOut, tagNames);

    expect(plain(patched)).toBe(plain(original));
    expect(patched.match(/<Ksiaze-Ramzes>/g)?.length).toBe(1);
    expect(patched.match(/<Nikotris>/g)?.length).toBe(1);
    expect(isValidXml(patched)).toBe(true);
  });

  test("case 3 · self-closing talking tag, attr kept", () => {
    const original = `
      <p>– Wracaj natychmiast!</p>`;

    const modelOut = `
      <p><Herhor talking="true"/> – Wracaj natychmiast!!</p>`; // “!” × 2

    const patched = restoreOriginalText(original, modelOut, tagNames);

    expect(plain(patched)).toBe(plain(original));
    expect(patched).toContain('<Herhor talking="true"/>');
    expect(isValidXml(patched)).toBe(true);
  });
});
