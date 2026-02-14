import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { extractChapters } from "../chapter-extractor";

const TEST_DIR = join(import.meta.dir, "__fixtures__");
const WORKSPACE_DIR = join(TEST_DIR, "workspace");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("extractChapters", () => {
  it("splits rich.xml into individual chapter files", () => {
    const richXml = `<?xml version="1.0" encoding="UTF-8"?>
<main>
<body><section data-chapter="1" data-epub-type="dedication">
  <p><b>To Punkie</b></p>
</section>
<section data-chapter="2" data-epub-type="chapter">
  <h2>Chapter I</h2>
  <p>It was a dark and stormy night.</p>
</section>
<section data-chapter="3" data-epub-type="chapter">
  <h2>Chapter II</h2>
  <p>The morning was bright.</p>
</section></body>
</main>`;

    const richXmlPath = join(TEST_DIR, "rich.xml");
    writeFileSync(richXmlPath, richXml, "utf-8");

    const chapters = extractChapters(richXmlPath, WORKSPACE_DIR);

    expect(chapters).toHaveLength(3);
    expect(chapters[0].chapterNumber).toBe(1);
    expect(chapters[1].chapterNumber).toBe(2);
    expect(chapters[2].chapterNumber).toBe(3);
  });

  it("creates both working and original copies", () => {
    const richXml = `<?xml version="1.0" encoding="UTF-8"?>
<main><body>
<section data-chapter="1" data-epub-type="chapter">
  <p>Hello world.</p>
</section>
</body></main>`;

    const richXmlPath = join(TEST_DIR, "rich.xml");
    writeFileSync(richXmlPath, richXml, "utf-8");

    const chapters = extractChapters(richXmlPath, WORKSPACE_DIR);

    expect(existsSync(chapters[0].filePath)).toBe(true);
    expect(existsSync(chapters[0].originalFilePath)).toBe(true);

    const working = readFileSync(chapters[0].filePath, "utf-8");
    const original = readFileSync(chapters[0].originalFilePath, "utf-8");
    expect(working).toBe(original);
  });

  it("sorts chapters by number", () => {
    const richXml = `<?xml version="1.0" encoding="UTF-8"?>
<main><body>
<section data-chapter="3" data-epub-type="chapter"><p>Third</p></section>
<section data-chapter="1" data-epub-type="chapter"><p>First</p></section>
<section data-chapter="2" data-epub-type="chapter"><p>Second</p></section>
</body></main>`;

    const richXmlPath = join(TEST_DIR, "rich.xml");
    writeFileSync(richXmlPath, richXml, "utf-8");

    const chapters = extractChapters(richXmlPath, WORKSPACE_DIR);

    expect(chapters[0].chapterNumber).toBe(1);
    expect(chapters[1].chapterNumber).toBe(2);
    expect(chapters[2].chapterNumber).toBe(3);
  });

  it("preserves section content including attributes", () => {
    const richXml = `<?xml version="1.0" encoding="UTF-8"?>
<main><body>
<section data-chapter="1" data-epub-type="chapter">
  <hgroup>
    <h2 data-epub-type="ordinal">I</h2>
    <p data-epub-type="title">The Beginning</p>
  </hgroup>
  <p>Content here.</p>
</section>
</body></main>`;

    const richXmlPath = join(TEST_DIR, "rich.xml");
    writeFileSync(richXmlPath, richXml, "utf-8");

    const chapters = extractChapters(richXmlPath, WORKSPACE_DIR);
    const content = readFileSync(chapters[0].filePath, "utf-8");

    expect(content).toContain('data-chapter="1"');
    expect(content).toContain('data-epub-type="chapter"');
    expect(content).toContain("The Beginning");
    expect(content).toContain("Content here.");
  });
});
