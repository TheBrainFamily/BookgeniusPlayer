import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { fixLegacyPlayStageDirections } from "./fix-legacy-play-stage-directions";

function parseSection(html: string): Element {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const section = doc.querySelector("section[data-chapter]");
  if (!section) {
    throw new Error("Missing section[data-chapter] in test input");
  }
  return section;
}

describe("fixLegacyPlayStageDirections", () => {
  it("converts legacy character tags in stage directions to spans with data-c and data-enters", () => {
    const input = `
      <section data-chapter="2">
        <p data-is-didaskalia="true">
          <em>Enter <Benvolio enters="true">BENVOLIO</Benvolio> and <Mercutio enters="true">MERCUTIO</Mercutio></em>
        </p>
      </section>
    `;

    const result = fixLegacyPlayStageDirections(input);
    const section = parseSection(result);

    const benvolio = section.querySelector('span[data-c="benvolio"][data-enters="true"]');
    const mercutio = section.querySelector('span[data-c="mercutio"][data-enters="true"]');

    expect(benvolio?.textContent).toBe("BENVOLIO");
    expect(mercutio?.textContent).toBe("MERCUTIO");

    expect(section.querySelector("benvolio")).toBeNull();
    expect(section.querySelector("mercutio")).toBeNull();
  });

  it("converts legacy exit tags to spans with data-exits", () => {
    const input = `
      <section data-chapter="2">
        <p data-is-didaskalia="true">
          <em>Exeunt all but <Benvolio>BENVOLIO</Benvolio><Sampson exits="true">SAMPSON</Sampson></em>
        </p>
      </section>
    `;

    const result = fixLegacyPlayStageDirections(input);
    const section = parseSection(result);

    const benvolio = section.querySelector('span[data-c="benvolio"]');
    const sampson = section.querySelector('span[data-c="sampson"][data-exits="true"]');

    expect(benvolio?.textContent).toBe("BENVOLIO");
    expect(sampson?.textContent).toBe("SAMPSON");
  });

  it("preserves custom attributes and drops raw enters/exits attributes", () => {
    const input = `
      <section data-chapter="2">
        <p data-is-didaskalia="true">
          <em>Enter <Capulet dynasty="true" enters="true">CAPULET</Capulet></em>
        </p>
      </section>
    `;

    const result = fixLegacyPlayStageDirections(input);
    const section = parseSection(result);

    const capulet = section.querySelector(
      'span[data-c="capulet"][data-enters="true"][dynasty="true"]',
    );

    expect(capulet?.textContent).toBe("CAPULET");
    expect(capulet?.hasAttribute("enters")).toBe(false);
    expect(capulet?.hasAttribute("exits")).toBe(false);
  });
});
