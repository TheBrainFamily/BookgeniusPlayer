import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { fixLegacyPlayDidaskalia } from "./fix-legacy-play-didaskalia";

function parseSection(html: string): Element {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const section = doc.querySelector("section[data-chapter]");
  if (!section) {
    throw new Error("Missing section[data-chapter] in test input");
  }
  return section;
}

describe("fixLegacyPlayDidaskalia", () => {
  it("moves didaskalia and narration into current speaker until next speaker block", () => {
    const input = `
      <section data-chapter="2">
        <div data-speaker="duncan" data-label="DUNCAN">
          <p>So well thy words become thee as thy wounds;</p>
          <p>They smack of honour both. Go get him surgeons.</p>
        </div>
        <p data-is-didaskalia="true"><em>Exit Sergeant, attended</em></p>
        <p>Who comes here?</p>
        <p data-is-didaskalia="true"><em>Enter ROSS</em></p>
        <div data-speaker="malcolm" data-label="MALCOLM">
          <p>The worthy thane of Ross.</p>
        </div>
      </section>
    `;

    const result = fixLegacyPlayDidaskalia(input);
    const section = parseSection(result);
    const duncan = section.querySelector('div[data-speaker="duncan"]');
    expect(duncan).toBeTruthy();
    const duncanPs = duncan?.querySelectorAll("p") ?? [];
    expect(duncanPs.length).toBe(4);
    expect(duncanPs[2]?.textContent).toContain("Exit Sergeant");
    expect(duncanPs[3]?.textContent).toContain("Who comes here?");

    const duncanNext = duncan?.nextElementSibling;
    expect(duncanNext?.tagName.toLowerCase()).toBe("p");
    expect(duncanNext?.textContent).toContain("Enter ROSS");
  });

  it("keeps didaskalia outside when it precedes the next speaker block", () => {
    const input = `
      <section data-chapter="2">
        <div data-speaker="duncan" data-label="DUNCAN">
          <p>So well thy words become thee as thy wounds;</p>
          <p>They smack of honour both. Go get him surgeons.</p>
        </div>
        <p data-is-didaskalia="true"><em>Enter ROSS</em></p>
        <div data-speaker="malcolm" data-label="MALCOLM">
          <p>The worthy thane of Ross.</p>
        </div>
      </section>
    `;

    const result = fixLegacyPlayDidaskalia(input);
    const section = parseSection(result);
    const duncan = section.querySelector('div[data-speaker="duncan"]');
    expect(duncan).toBeTruthy();
    const duncanPs = duncan?.querySelectorAll("p") ?? [];
    expect(duncanPs.length).toBe(2);

    const duncanNext = duncan?.nextElementSibling;
    expect(duncanNext?.tagName.toLowerCase()).toBe("p");
    expect(duncanNext?.textContent).toContain("Enter ROSS");
  });

  it("keeps trailing didaskalia outside when it is the last element", () => {
    const input = `
      <section data-chapter="9">
        <div data-speaker="macbeth" data-label="MACBETH">
          <p>How goes the night, boy?</p>
        </div>
        <p data-is-didaskalia="true"><em>Exit</em></p>
      </section>
    `;

    const result = fixLegacyPlayDidaskalia(input);
    const section = parseSection(result);
    const macbeth = section.querySelector('div[data-speaker="macbeth"]');
    expect(macbeth).toBeTruthy();
    const macbethPs = macbeth?.querySelectorAll("p") ?? [];
    expect(macbethPs.length).toBe(1);

    const next = macbeth?.nextElementSibling;
    expect(next?.tagName.toLowerCase()).toBe("p");
    expect(next?.getAttribute("data-is-didaskalia")).toBe("true");
    expect(next?.textContent).toContain("Exit");
  });
});
