import { describe, expect, it } from "vitest";
import { convertSEBook } from "./index";

import { extractSENotesFromXhtml, rewriteSeNoteRefsToDataNote } from "./notes";

describe("SE notes helpers", () => {
  describe("extractSENotesFromXhtml", () => {
    it("extracts endnote li blocks as fn-style note IDs", () => {
      const input = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <section id="endnotes" epub:type="endnotes">
      <ol>
        <li id="note-1" epub:type="endnote"><p>First note.</p></li>
        <li id="note-2" epub:type="endnote"><p>Second <em>note</em>.</p></li>
      </ol>
    </section>
  </body>
</html>`;

      const notes = extractSENotesFromXhtml(input);

      expect(notes).toHaveLength(2);
      expect(notes[0]).toEqual({ noteId: "fn1", content: "<p>First note.</p>" });
      expect(notes[1].noteId).toBe("fn2");
      expect(notes[1].content).toContain("Second <em>note</em>");
    });

    it("removes backlink anchors and backlink-only paragraphs", () => {
      const input = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <section id="endnotes" epub:type="endnotes">
      <ol>
        <li id="note-7" epub:type="endnote">
          <p>Main note text.</p>
          <p><a href="preface.xhtml#noteref-7" epub:type="backlink">↩</a></p>
        </li>
      </ol>
    </section>
  </body>
</html>`;

      const notes = extractSENotesFromXhtml(input);

      expect(notes).toHaveLength(1);
      expect(notes[0].noteId).toBe("fn7");
      expect(notes[0].content).toContain("Main note text");
      expect(notes[0].content).not.toContain("↩");
      expect(notes[0].content).not.toContain("backlink");
    });

    it("ignores list items that are not note-N IDs", () => {
      const input = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <section id="endnotes" epub:type="endnotes">
      <ol>
        <li id="appendix-1"><p>Not a note.</p></li>
        <li id="note-3"><p>Valid note.</p></li>
      </ol>
    </section>
  </body>
</html>`;

      const notes = extractSENotesFromXhtml(input);

      expect(notes).toHaveLength(1);
      expect(notes[0]).toEqual({ noteId: "fn3", content: "<p>Valid note.</p>" });
    });
  });

  describe("rewriteSeNoteRefsToDataNote", () => {
    it("rewrites endnotes.xhtml#note-N links to data-note", () => {
      const input = `<!DOCTYPE html><html><body>
        <section data-chapter="1">
          <p>Text <a href="endnotes.xhtml#note-12" id="noteref-12" data-epub-type="noteref">12</a></p>
        </section>
      </body></html>`;

      const output = rewriteSeNoteRefsToDataNote(input);

      expect(output).toContain('data-note="12"');
      expect(output).not.toContain('href="endnotes.xhtml#note-12"');
      expect(output).toContain('class="link-note"');
      expect(output).not.toContain('id="noteref-12"');
      expect(output).not.toContain('data-epub-type="noteref"');
    });

    it("rewrites notes.xhtml#note-N links as well", () => {
      const input = `<!DOCTYPE html><html><body>
        <section data-chapter="1">
          <p>Text <a data-epub-type="noteref" href="notes.xhtml#note-2">2</a></p>
        </section>
      </body></html>`;

      const output = rewriteSeNoteRefsToDataNote(input);

      expect(output).toContain('data-note="2"');
      expect(output).not.toContain('href="notes.xhtml#note-2"');
    });

    it("does not rewrite non-endnote links", () => {
      const input = `<!DOCTYPE html><html><body>
        <section data-chapter="1">
          <p>Keep <a href="appendix-2.xhtml#appendix-2-3" data-epub-type="noteref">note</a></p>
        </section>
      </body></html>`;

      const output = rewriteSeNoteRefsToDataNote(input);

      expect(output).toContain('href="appendix-2.xhtml#appendix-2-3"');
      expect(output).not.toContain("data-note=");
    });

    it("rewrites multiple note references in one paragraph", () => {
      const input = `<!DOCTYPE html><html><body>
        <section data-chapter="1">
          <p>Text<a href="endnotes.xhtml#note-1">1</a> more<a href="endnotes.xhtml#note-2">2</a></p>
        </section>
      </body></html>`;

      const output = rewriteSeNoteRefsToDataNote(input);

      expect(output).toContain('data-note="1"');
      expect(output).toContain('data-note="2"');
      expect(output).not.toContain('href="endnotes.xhtml#note-1"');
      expect(output).not.toContain('href="endnotes.xhtml#note-2"');
    });
  });

  describe("integration with SE converter", () => {
    it("extracts notes and rewrites note hrefs for sample SE book", async () => {
      const result = await convertSEBook("abu-al-ala-al-maarri_the-luzumiyat_ameen-rihani");

      expect(result.notes.length).toBeGreaterThan(0);
      expect(result.notes.some((n) => n.noteId === "fn1")).toBe(true);
      expect(result.textHtml).toContain('data-note="1"');
      expect(result.textHtml).not.toContain('href="endnotes.xhtml#note-1"');
    });
  });
});
