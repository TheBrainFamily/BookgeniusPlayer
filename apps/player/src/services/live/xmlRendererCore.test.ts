import { describe, it, expect } from "vitest";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { renderChapterFromXmlDocument } from "./xmlRendererCore";

const parseXml = (xml: string): Document => {
  const parser = new DOMParser();
  return parser.parseFromString(xml, "text/xml") as unknown as Document;
};

const renderOptions = {
  bookSlug: "test-book",
  bookLang: "english",
  bookForm: "play",
  characterBundles: [
    { slug: "theseus", name: "Theseus", extra: { displayName: "Theseus" } },
    { slug: "hippolyta", name: "Hippolyta", extra: { displayName: "Hippolyta" } },
    { slug: "wukong", name: "Wukong", extra: { displayName: "Wukong" } },
    { slug: "master-bodhi", name: "Master Bodhi", extra: { displayName: "Master Bodhi" } },
  ],
  serializer: new XMLSerializer(),
};

describe("renderChapterFromXmlDocument", () => {
  describe("character enters/exits attributes", () => {
    it("preserves data-enters on characters in stage directions (em tags)", () => {
      const xml = `
        <Chapter id="1">
          <p><span id="ch1-p0-s1"><em>Enter <Theseus enters="true">Theseus</Theseus> and <Hippolyta enters="true">Hippolyta</Hippolyta>.</em></span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('data-c="theseus"');
      expect(html).toContain('data-enters="true"');
      expect(html).toMatch(/data-c="theseus"[^>]*data-enters="true"/);
      expect(html).toMatch(/data-c="hippolyta"[^>]*data-enters="true"/);
    });

    it("preserves data-exits on characters in stage directions", () => {
      const xml = `
        <Chapter id="1">
          <p><span id="ch1-p0-s1"><em><Theseus exits="true"/>Exeunt.</em></span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('data-exits="true"');
    });

    it("preserves data-enters on talking characters (Wukong pattern)", () => {
      const xml = `
        <Chapter id="1">
          <p><Wukong enters="true" talking="true"/><strong>WUKONG</strong></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('data-character="wukong"');
      expect(html).toContain('data-is-talking="true"');
      expect(html).toContain('data-enters="true"');
    });

    it("preserves data-enters on non-talking character mentions", () => {
      const xml = `
        <Chapter id="1">
          <p><span id="ch1-p0-s1">He found the <Master-Bodhi enters="true">Patriarch Bodhi</Master-Bodhi>.</span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('data-c="master-bodhi"');
      expect(html).toContain('data-enters="true"');
      expect(html).toContain("Patriarch Bodhi");
    });

    it("handles character with both enters and exits", () => {
      const xml = `
        <Chapter id="1">
          <p><span id="ch1-p0-s1"><em><Theseus enters="true" exits="true"/>Passes through.</em></span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('data-enters="true"');
      expect(html).toContain('data-exits="true"');
    });
  });

  describe("play format structure", () => {
    it("wraps content in play-row divs for play format", () => {
      const xml = `
        <Chapter id="1">
          <p><Theseus talking="true"/><strong>THESEUS</strong></p>
          <p><span id="ch1-p1-s1">Welcome, fair Hippolyta.</span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('class="play-row"');
      expect(html).toContain('class="character-avatar"');
      expect(html).toContain('class="character-text"');
    });

    it("marks stage directions as didaskalia", () => {
      const xml = `
        <Chapter id="1">
          <p><span id="ch1-p0-s1"><em>Enter Theseus.</em></span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('data-is-didaskalia="true"');
      expect(html).toContain("didaskalia-row");
    });

    it("alternates text alignment for different speakers", () => {
      const xml = `
        <Chapter id="1">
          <p><Theseus talking="true"/><strong>THESEUS</strong></p>
          <p><span id="ch1-p1-s1">Hello.</span></p>
          <p><Hippolyta talking="true"/><strong>HIPPOLYTA</strong></p>
          <p><span id="ch1-p2-s1">Hi.</span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('data-text-alignment="left"');
      expect(html).toContain('data-text-alignment="right"');
    });
  });
});
