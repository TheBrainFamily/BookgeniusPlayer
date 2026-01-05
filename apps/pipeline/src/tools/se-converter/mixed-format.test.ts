import { describe, it, expect } from "bun:test";
import { convertSeXhtmlToHtml } from "./index";

describe("SE Converter - Mixed prose and play format", () => {
  describe("prose with embedded drama tables", () => {
    it("preserves drama table in prose with data attributes for styling", () => {
      const files = [
        {
          filename: "chapter-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter z3998:fiction">
    <section id="chapter-1" epub:type="chapter">
      <h2>Chapter 1</h2>
      <p>Piglet thought about what he would say:</p>
      <table epub:type="z3998:drama">
        <tbody>
          <tr>
            <td epub:type="z3998:persona">Heffalump</td>
            <td>"Ho-ho!"</td>
          </tr>
          <tr>
            <td epub:type="z3998:persona">Piglet</td>
            <td>"Tra-la-la."</td>
          </tr>
        </tbody>
      </table>
      <p>And then he woke up.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).toContain('data-chapter-format="mixed"');
      expect(result.textHtml).toContain('data-drama=""');
      expect(result.textHtml).toContain('data-speaker="heffalump"');
      expect(result.textHtml).toContain('data-speaker="piglet"');
      expect(result.textHtml).toContain('data-persona=""');
      expect(result.textHtml).toContain("Piglet thought about what he would say:");
      expect(result.textHtml).toContain("And then he woke up.");
      expect(result.textHtml).toContain("<table");
    });

    it("preserves inline stage directions within drama dialogue", () => {
      const files = [
        {
          filename: "chapter-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="chapter-1" epub:type="chapter">
      <h2>Chapter 1</h2>
      <table epub:type="z3998:drama">
        <tbody>
          <tr>
            <td epub:type="z3998:persona">Heffalump</td>
            <td><i epub:type="z3998:stage-direction">Gloatingly.</i> "Ho-ho!"</td>
          </tr>
        </tbody>
      </table>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).toContain('class="inline-stage-direction"');
      expect(result.textHtml).toContain("Gloatingly.");
      expect(result.textHtml).toContain('"Ho-ho!"');
    });

    it("handles multiple drama tables in same chapter", () => {
      const files = [
        {
          filename: "chapter-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="chapter-1" epub:type="chapter">
      <h2>Chapter 1</h2>
      <p>First conversation:</p>
      <table epub:type="z3998:drama">
        <tbody>
          <tr>
            <td epub:type="z3998:persona">Pooh</td>
            <td>"Hello."</td>
          </tr>
        </tbody>
      </table>
      <p>Later that day:</p>
      <table epub:type="z3998:drama">
        <tbody>
          <tr>
            <td epub:type="z3998:persona">Rabbit</td>
            <td>"Goodbye."</td>
          </tr>
        </tbody>
      </table>
      <p>The end.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).toContain('data-speaker="pooh"');
      expect(result.textHtml).toContain('data-speaker="rabbit"');
      expect(result.textHtml).toContain("First conversation:");
      expect(result.textHtml).toContain("Later that day:");
      expect(result.textHtml).toContain("The end.");
    });
  });

  describe("blockquotes (songs, timelines)", () => {
    it("preserves blockquote structure for songs", () => {
      const files = [
        {
          filename: "chapter-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="chapter-1" epub:type="chapter">
      <h2>Chapter 1</h2>
      <p>Pooh sang a song:</p>
      <blockquote epub:type="z3998:song">
        <p>
          <span class="i1">Tra-la-la, tra-la-la,</span>
          <br/>
          <span>Rum-tum-tum.</span>
        </p>
      </blockquote>
      <p>It was a good song.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).toContain("<blockquote");
      expect(result.textHtml).toContain("Tra-la-la");
      expect(result.textHtml).toContain("Rum-tum-tum");
      expect(result.textHtml).toContain("Pooh sang a song:");
      expect(result.textHtml).toContain("It was a good song.");
    });

    it("preserves blockquote with ordered list (timeline)", () => {
      const files = [
        {
          filename: "chapter-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="chapter-1" epub:type="chapter">
      <h2>Chapter 1</h2>
      <p>His plan was:</p>
      <blockquote epub:type="z3998:timeline">
        <header role="presentation">
          <p>Order of Looking for Things</p>
        </header>
        <ol>
          <li><p>Find Piglet.</p></li>
          <li><p>Find Small.</p></li>
        </ol>
      </blockquote>
      <p>It seemed simple.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).toContain("<blockquote");
      expect(result.textHtml).toContain("<ol");
      expect(result.textHtml).toContain("Find Piglet");
      expect(result.textHtml).toContain("Find Small");
      expect(result.textHtml).toContain("Order of Looking for Things");
    });
  });

  describe("hgroup titles", () => {
    it("converts hgroup with ordinal and title", () => {
      const files = [
        {
          filename: "chapter-3.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="chapter-3" epub:type="chapter">
      <hgroup>
        <h2 epub:type="ordinal z3998:roman">III</h2>
        <p epub:type="title">In Which a Search Is Organdized</p>
      </hgroup>
      <p>Pooh was sitting in his house.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).toContain("III");
      expect(result.textHtml).toContain("In Which a Search Is Organdized");
      expect(result.textHtml).toContain("Pooh was sitting in his house.");
    });
  });

  describe("full mixed chapter", () => {
    it("handles a complex chapter with prose, drama, blockquotes", () => {
      const files = [
        {
          filename: "chapter-3.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter z3998:fiction">
    <section id="chapter-3" epub:type="chapter">
      <hgroup>
        <h2 epub:type="ordinal z3998:roman">III</h2>
        <p epub:type="title">The Search</p>
      </hgroup>
      <p>Piglet thought about what he would say:</p>
      <table epub:type="z3998:drama">
        <tbody>
          <tr>
            <td epub:type="z3998:persona">Heffalump</td>
            <td><i epub:type="z3998:stage-direction">Gloatingly.</i> "Ho-ho!"</td>
          </tr>
          <tr>
            <td epub:type="z3998:persona">Piglet</td>
            <td><i epub:type="z3998:stage-direction">Carelessly.</i> "Tra-la-la."</td>
          </tr>
        </tbody>
      </table>
      <p>Christopher Robin sang:</p>
      <blockquote epub:type="z3998:song">
        <p>
          <span>Tra-la-la, tra-la-la,</span>
          <br/>
          <span>Rum-tum-tum.</span>
        </p>
      </blockquote>
      <p>The end.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).toContain("III");
      expect(result.textHtml).toContain("The Search");
      expect(result.textHtml).toContain("Piglet thought about what he would say:");
      expect(result.textHtml).toContain('data-speaker="heffalump"');
      expect(result.textHtml).toContain('data-speaker="piglet"');
      expect(result.textHtml).toContain('data-drama=""');
      expect(result.textHtml).toContain("Gloatingly.");
      expect(result.textHtml).toContain("Christopher Robin sang:");
      expect(result.textHtml).toContain("<blockquote");
      expect(result.textHtml).toContain("The end.");
      expect(result.textHtml).toContain("<table");
    });
  });

  describe("chapter format detection", () => {
    it("marks chapters with drama tables as mixed format", () => {
      const files = [
        {
          filename: "chapter-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="chapter-1" epub:type="chapter">
      <h2>Chapter 1</h2>
      <p>Some prose.</p>
      <table epub:type="z3998:drama">
        <tbody>
          <tr>
            <td epub:type="z3998:persona">Character</td>
            <td>"Line."</td>
          </tr>
        </tbody>
      </table>
      <p>More prose.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).toContain('data-chapter-format="mixed"');
    });

    it("marks pure prose chapters without drama as prose format", () => {
      const files = [
        {
          filename: "chapter-1.xhtml",
          content: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body epub:type="bodymatter">
    <section id="chapter-1" epub:type="chapter">
      <h2>Chapter 1</h2>
      <p>Just prose here.</p>
      <p>No drama tables.</p>
    </section>
  </body>
</html>`,
        },
      ];

      const result = convertSeXhtmlToHtml(files);

      expect(result.textHtml).not.toContain('data-chapter-format="mixed"');
      expect(result.textHtml).not.toContain('data-chapter-format="play"');
    });
  });
});
