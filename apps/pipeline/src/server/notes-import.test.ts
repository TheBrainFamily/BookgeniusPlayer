import { describe, expect, it } from "vitest";

import {
  buildNotesToUploadFromNoteMap,
  collectReferencedNoteIdsByChapter,
  normalizeNoteRefId,
} from "./notes-import";

describe("pipeline notes import helpers", () => {
  describe("normalizeNoteRefId", () => {
    it("normalizes numeric and note-/fn- patterns to fnN", () => {
      expect(normalizeNoteRefId("1")).toBe("fn1");
      expect(normalizeNoteRefId("note-42")).toBe("fn42");
      expect(normalizeNoteRefId("fn9")).toBe("fn9");
    });

    it("returns null for unsupported IDs", () => {
      expect(normalizeNoteRefId("appendix-1")).toBeNull();
      expect(normalizeNoteRefId("")).toBeNull();
    });
  });

  describe("collectReferencedNoteIdsByChapter", () => {
    it("extracts note refs from both <a data-note> and <note id>", () => {
      const richXml = `<?xml version="1.0" encoding="UTF-8"?>
<main>
  <body>
    <section data-chapter="1">
      <p>A <a class="link-note" data-note="3">3</a></p>
    </section>
    <section data-chapter="2">
      <p>B <note id="4"></note></p>
    </section>
  </body>
</main>`;

      const refs = collectReferencedNoteIdsByChapter(richXml);

      expect(refs).toEqual([
        { noteId: "fn3", chapter: 1 },
        { noteId: "fn4", chapter: 2 },
      ]);
    });

    it("handles data-note attribute regardless of attribute order", () => {
      const richXml = `<?xml version="1.0" encoding="UTF-8"?>
<main>
  <body>
    <section data-chapter="7">
      <p><a id="x" data-epub-type="noteref" data-note="15" class="link-note">15</a></p>
    </section>
  </body>
</main>`;

      const refs = collectReferencedNoteIdsByChapter(richXml);

      expect(refs).toEqual([{ noteId: "fn15", chapter: 7 }]);
    });

    it("deduplicates repeated references and keeps first chapter", () => {
      const richXml = `<?xml version="1.0" encoding="UTF-8"?>
<main>
  <body>
    <section data-chapter="2">
      <p><a data-note="8">8</a></p>
    </section>
    <section data-chapter="3">
      <p><a data-note="8">8</a></p>
    </section>
  </body>
</main>`;

      const refs = collectReferencedNoteIdsByChapter(richXml);

      expect(refs).toEqual([{ noteId: "fn8", chapter: 2 }]);
    });
  });

  describe("buildNotesToUploadFromNoteMap", () => {
    it("builds upload payload by matching rich.xml references with available notes", () => {
      const richXml = `<?xml version="1.0" encoding="UTF-8"?>
<main>
  <body>
    <section data-chapter="1"><p><a data-note="1">1</a></p></section>
    <section data-chapter="2"><p><a data-note="2">2</a></p></section>
  </body>
</main>`;

      const noteMap = new Map<string, string>([
        ["fn1", "<p>First</p>"],
        ["fn2", "<p>Second</p>"],
        ["fn99", "<p>Orphan</p>"],
      ]);

      const uploads = buildNotesToUploadFromNoteMap({ bookPath: "books/test", richXml, noteMap });

      expect(uploads).toEqual([
        { bookPath: "books/test", noteId: "fn1", content: "<p>First</p>", chapter: 1 },
        { bookPath: "books/test", noteId: "fn2", content: "<p>Second</p>", chapter: 2 },
      ]);
    });

    it("returns empty when no references are present", () => {
      const uploads = buildNotesToUploadFromNoteMap({
        bookPath: "books/test",
        richXml:
          '<?xml version="1.0"?><main><body><section data-chapter="1"><p>No refs</p></section></body></main>',
        noteMap: new Map([["fn1", "<p>First</p>"]]),
      });

      expect(uploads).toEqual([]);
    });
  });
});
