import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { verifyTextInvariance } from "../text-verifier";

const TEST_DIR = join(import.meta.dir, "__fixtures__");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function writeFixture(filename: string, content: string): string {
  const filePath = join(TEST_DIR, filename);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("verifyTextInvariance", () => {
  it("returns true for identical files", () => {
    const content = "<section><p>Hello world.</p></section>";
    const original = writeFixture("original.xhtml", content);
    const edited = writeFixture("edited.xhtml", content);

    expect(verifyTextInvariance(original, edited)).toBe(true);
  });

  it("returns true when only data attributes are added", () => {
    const original = writeFixture(
      "original.xhtml",
      '<section><p>"Good morning," said the doctor.</p></section>',
    );
    const edited = writeFixture(
      "edited.xhtml",
      '<section><p><span data-speaker="doctor">"Good morning,"</span> said the <span data-c="doctor">doctor</span>.</p></section>',
    );

    expect(verifyTextInvariance(original, edited)).toBe(true);
  });

  it("returns true when span wrappers are added around text", () => {
    const original = writeFixture(
      "original.xhtml",
      "<section><p>Henry Clerval arrived.</p></section>",
    );
    const edited = writeFixture(
      "edited.xhtml",
      '<section><p><span data-c="henry-clerval">Henry Clerval</span> arrived.</p></section>',
    );

    expect(verifyTextInvariance(original, edited)).toBe(true);
  });

  it("returns false when text is added", () => {
    const original = writeFixture("original.xhtml", "<section><p>Hello world.</p></section>");
    const edited = writeFixture("edited.xhtml", "<section><p>Hello beautiful world.</p></section>");

    expect(verifyTextInvariance(original, edited)).toBe(false);
  });

  it("returns false when text is removed", () => {
    const original = writeFixture(
      "original.xhtml",
      "<section><p>Hello beautiful world.</p></section>",
    );
    const edited = writeFixture("edited.xhtml", "<section><p>Hello world.</p></section>");

    expect(verifyTextInvariance(original, edited)).toBe(false);
  });

  it("returns false when text is changed", () => {
    const original = writeFixture(
      "original.xhtml",
      "<section><p>The cat sat on the mat.</p></section>",
    );
    const edited = writeFixture(
      "edited.xhtml",
      "<section><p>The dog sat on the mat.</p></section>",
    );

    expect(verifyTextInvariance(original, edited)).toBe(false);
  });

  it("handles complex nested annotations without text change", () => {
    const original = writeFixture(
      "original.xhtml",
      `<section>
        <p>"My dear Frankenstein," exclaimed he, "how glad I am to see you!"</p>
      </section>`,
    );
    const edited = writeFixture(
      "edited.xhtml",
      `<section>
        <p><span data-speaker="henry-clerval">"My dear <span data-c="victor-frankenstein">Frankenstein</span>," exclaimed he, "how glad I am to see you!"</span></p>
      </section>`,
    );

    expect(verifyTextInvariance(original, edited)).toBe(true);
  });

  it("handles blockquote with data-speaker attribute", () => {
    const original = writeFixture(
      "original.xhtml",
      `<section>
        <blockquote epub:type="z3998:letter">
          <p>Dear friend, I write to you.</p>
        </blockquote>
      </section>`,
    );
    const edited = writeFixture(
      "edited.xhtml",
      `<section>
        <blockquote epub:type="z3998:letter" data-speaker="robert-walton">
          <p>Dear friend, I write to you.</p>
        </blockquote>
      </section>`,
    );

    expect(verifyTextInvariance(original, edited)).toBe(true);
  });
});
