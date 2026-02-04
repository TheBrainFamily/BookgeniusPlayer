import { describe, expect, it } from "vitest";
import {
  applyMultiSpeakerMapToHtml,
  extractMultiSpeakerNextLineMapFromXml,
} from "./fix-legacy-play-multi-speaker";

describe("extractMultiSpeakerNextLineMapFromXml", () => {
  it("maps the next line id to multiple speaker slugs", () => {
    const xml = `
      <Chapter id="1">
        <p><span id="ch1-p21-s1"><First-Witch talking="true"/><Second-Witch talking="true"/><Third-Witch talking="true"/><strong>ALL</strong></span></p>
        <p><span id="ch1-p22-s1">Fair is foul, and foul is fair:</span></p>
      </Chapter>
    `;

    const map = extractMultiSpeakerNextLineMapFromXml(xml);
    expect(map.get("ch1-p22-s1")).toEqual(["first-witch", "second-witch", "third-witch"]);
  });
});

describe("applyMultiSpeakerMapToHtml", () => {
  it("updates data-speaker based on the next line id", () => {
    const html = `
      <section data-chapter="1">
        <div data-speaker="first-witch" data-label="ALL">
          <p><span id="ch1-p22-s1">Fair is foul, and foul is fair:</span></p>
          <p><span id="ch1-p23-s1">Hover through the fog and filthy air.</span></p>
        </div>
      </section>
    `;

    const map = new Map<string, string[]>([
      ["ch1-p22-s1", ["first-witch", "second-witch", "third-witch"]],
    ]);

    const result = applyMultiSpeakerMapToHtml(html, map);
    expect(result).toContain('data-speaker="first-witch second-witch third-witch"');
  });
});
