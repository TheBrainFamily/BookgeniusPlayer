import { describe, expect, it } from "vitest";
import { restoreUnwrappedBlocks } from "./restore-unwrapped-blocks";

describe("restoreUnwrappedBlocks", () => {
  it("wraps dangling text and inline nodes using the original block element", () => {
    const original = "<p>Alpha</p><p>Miss <em>Howard</em> nodded grimly.</p><p>Omega</p>";
    const model = "<p>Alpha</p>Miss <em>Howard</em> nodded grimly.<p>Omega</p>";

    expect(restoreUnwrappedBlocks(original, model)).toBe(
      "<p>Alpha</p><p>Miss <em>Howard</em> nodded grimly.</p><p>Omega</p>",
    );
  });

  it("preserves original attributes when rewrapping", () => {
    const original = '<p data-index="1">First</p><p data-index="2">Second</p>';
    const model = '<p data-index="1">First</p>Second';

    expect(restoreUnwrappedBlocks(original, model)).toBe(
      '<p data-index="1">First</p><p data-index="2">Second</p>',
    );
  });

  it("leaves unmatched dangling text untouched", () => {
    const original = "<p>One</p><p>Two</p>";
    const model = "<p>One</p>Extra<p>Two</p>";

    expect(restoreUnwrappedBlocks(original, model)).toBe("<p>One</p>Extra<p>Two</p>");
  });

  it("returns the input when no dangling nodes exist", () => {
    const original = "<p>One</p><p>Two</p>";
    const model = "<p>One</p><p>Two</p>";

    expect(restoreUnwrappedBlocks(original, model)).toBe(model);
  });
});
