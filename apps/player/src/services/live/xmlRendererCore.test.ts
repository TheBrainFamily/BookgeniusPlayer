/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { DOMParser as XmlDomParser, XMLSerializer } from "@xmldom/xmldom";
import { renderChapterFromXmlDocument } from "./xmlRendererCore";

const parseXml = (xml: string): Document => {
  const parser = new XmlDomParser();
  return parser.parseFromString(xml, "text/xml") as unknown as Document;
};

// Use browser DOMParser (from jsdom) for parsing HTML output
const parseHtml = (html: string): Document => {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
};

const renderOptions = {
  bookSlug: "test-book",
  bookLang: "english",
  bookForm: "play",
  characterBundles: [
    { slug: "theseus", name: "Theseus", metadata: { displayName: "Theseus" } },
    { slug: "hippolyta", name: "Hippolyta", metadata: { displayName: "Hippolyta" } },
    { slug: "wukong", name: "Wukong", metadata: { displayName: "Wukong" } },
    { slug: "master-bodhi", name: "Master Bodhi", metadata: { displayName: "Master Bodhi" } },
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

      // Format B: speaker info is in div attributes, not character-placeholder spans
      expect(html).toContain('data-speaker="wukong"');
      expect(html).toContain('data-label="WUKONG"');
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

  describe("Format B output (compact storage format)", () => {
    it("outputs speaker block as div with data-speaker and data-label", () => {
      const xml = `
        <Chapter id="1">
          <p><Theseus talking="true"/><strong>THESEUS</strong></p>
          <p><span id="ch1-p1-s1">Welcome, fair Hippolyta.</span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      // Format B: <div data-speaker="theseus" data-label="THESEUS">
      expect(html).toContain('data-speaker="theseus"');
      expect(html).toContain('data-label="THESEUS"');

      // Should NOT have verbose play-row structure (htmlNormalizer adds these)
      expect(html).not.toContain('class="play-row"');
      expect(html).not.toContain('class="character-avatar"');
      expect(html).not.toContain('class="character-text"');
    });

    it("groups consecutive paragraphs from same speaker in one div", () => {
      const xml = `
        <Chapter id="1">
          <p><Theseus talking="true"/><strong>THESEUS</strong></p>
          <p><span id="ch1-p1-s1">Line one.</span></p>
          <p><span id="ch1-p2-s1">Line two.</span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);
      const doc = parseHtml(html);

      // Should have one speaker div with multiple p children
      const speakerDiv = doc.querySelector('[data-speaker="theseus"]');
      expect(speakerDiv).toBeTruthy();

      const paragraphs = speakerDiv?.querySelectorAll("p");
      expect(paragraphs?.length).toBe(2);
    });

    it("marks stage directions with data-is-didaskalia (no wrapper divs)", () => {
      const xml = `
        <Chapter id="1">
          <p><span id="ch1-p0-s1"><em>Enter Theseus.</em></span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('data-is-didaskalia="true"');
      // Should NOT have didaskalia-row wrapper (htmlNormalizer adds this)
      expect(html).not.toContain("didaskalia-row");
      expect(html).not.toContain("didaskalia-text");
    });

    it("preserves span IDs in content paragraphs", () => {
      const xml = `
        <Chapter id="1">
          <p><Theseus talking="true"/><strong>THESEUS</strong></p>
          <p><span id="ch1-p1-s1">Welcome.</span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('id="ch1-p1-s1"');
    });

    it("extracts label from strong tag in XML", () => {
      const xml = `
        <Chapter id="1">
          <p><Theseus talking="true"/><strong>LORD THESEUS</strong></p>
          <p><span id="ch1-p1-s1">Welcome.</span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      // Label should come from the <strong> text, not character displayName
      expect(html).toContain('data-label="LORD THESEUS"');
    });

    it("handles multiple speakers with separate divs", () => {
      const xml = `
        <Chapter id="1">
          <p><Theseus talking="true"/><strong>THESEUS</strong></p>
          <p><span id="ch1-p1-s1">Hello.</span></p>
          <p><Hippolyta talking="true"/><strong>HIPPOLYTA</strong></p>
          <p><span id="ch1-p2-s1">Hi.</span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);
      const doc = parseHtml(html);

      const speakerDivs = doc.querySelectorAll("[data-speaker]");
      expect(speakerDivs.length).toBe(2);
      expect(speakerDivs[0].getAttribute("data-speaker")).toBe("theseus");
      expect(speakerDivs[1].getAttribute("data-speaker")).toBe("hippolyta");
    });

    it("preserves data-c and data-enters on character mentions", () => {
      const xml = `
        <Chapter id="1">
          <p><span id="ch1-p0-s1"><em>Enter <Theseus enters="true">Theseus</Theseus>.</em></span></p>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain('data-c="theseus"');
      expect(html).toContain('data-enters="true"');
    });

    it("handles Act/Title/Subtitle elements", () => {
      const xml = `
        <Chapter id="1">
          <Act>ACT I</Act>
          <Title>SCENE I.</Title>
          <Subtitle>Athens. A street.</Subtitle>
        </Chapter>
      `;
      const { html } = renderChapterFromXmlDocument(parseXml(xml), renderOptions);

      expect(html).toContain("<h3");
      expect(html).toContain("ACT I");
      expect(html).toContain("<h4");
      expect(html).toContain("SCENE I.");
      expect(html).toContain("<h5");
      expect(html).toContain("Athens. A street.");
    });
  });
});
