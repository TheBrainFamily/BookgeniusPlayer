/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CharacterData } from "@player/types/book";

// Mock getCharactersData before importing the module under test
const mockGetCharactersData = vi.fn<() => CharacterData[]>();
vi.mock("@player/state/bookDataStore", () => ({
  getCharactersData: () => mockGetCharactersData(),
}));

// Stub out SVG avatar helper (uses canvas which jsdom doesn't support)
vi.mock("@player/helpers/svgAvatars", () => ({
  getAvatarSource: () => "data:image/svg+xml,<svg/>",
}));

import { hydrateInlineAvatarsInSection } from "../activateMediaInRange";

/** Build a minimal CharacterData fixture */
function makeCharacter(slug: string, name: string): CharacterData {
  return {
    slug,
    characterName: name,
    bookSlug: "frankenstein",
    infoPerChapter: [],
    media: { avatarUrl: `https://cdn.example.com/${slug}/avatar.webp` },
  } as CharacterData;
}

/** Parse an HTML string into a <section> element */
function parseSection(html: string): HTMLElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const section = doc.querySelector<HTMLElement>("section[data-chapter]");
  if (!section) throw new Error("Missing section[data-chapter] in test HTML");
  return section;
}

const GENERIC_AVATAR: CharacterData = {
  slug: "generic-avatar",
  characterName: "Generic",
  bookSlug: "frankenstein",
  infoPerChapter: [],
  media: { avatarUrl: "https://cdn.example.com/generic/avatar.webp" },
} as CharacterData;

describe("hydrateInlineAvatarsInSection", () => {
  beforeEach(() => {
    mockGetCharactersData.mockReset();
  });

  it("populates a start-of-paragraph avatar shell for a known character", () => {
    const creature = makeCharacter("the-creature-frankensteins-monster-the-daemon", "The Creature");
    mockGetCharactersData.mockReturnValue([creature, GENERIC_AVATAR]);

    const section = parseSection(`
      <section data-chapter="20">
        <p data-index="5">
          <span data-speaker="the-creature-frankensteins-monster-the-daemon" class="has-speaker">
            <span class="character-placeholder character-talking start-of-paragraph"
                  data-character="the-creature-frankensteins-monster-the-daemon"
                  data-is-talking="false" data-media-injected="false">
              <span class="inline-avatar" data-character="the-creature-frankensteins-monster-the-daemon"
                    title="The Creature"></span>
            </span>
            "My mode of life in my hovel was uniform."
          </span>
        </p>
      </section>
    `);

    hydrateInlineAvatarsInSection(section);

    const shell = section.querySelector(".inline-avatar") as HTMLElement;
    expect(shell.querySelector("img")).toBeTruthy();
    // Placeholder should remain visible
    const placeholder = section.querySelector(".character-placeholder") as HTMLElement;
    expect(placeholder.style.display).not.toBe("none");
  });

  it("shows generic avatar for unknown start-of-paragraph speakers", () => {
    // Only generic-avatar exists; "cottagers" is unknown
    mockGetCharactersData.mockReturnValue([GENERIC_AVATAR]);

    const section = parseSection(`
      <section data-chapter="20">
        <p data-index="10">
          <span data-speaker="cottagers" class="has-speaker">
            <span class="character-placeholder character-talking start-of-paragraph"
                  data-character="cottagers"
                  data-is-talking="false" data-media-injected="false">
              <span class="inline-avatar" data-character="cottagers" title="Cottagers"></span>
            </span>
            'good spirit'
          </span>
        </p>
      </section>
    `);

    hydrateInlineAvatarsInSection(section);

    // Should still get an avatar (generic fallback) for start-of-paragraph
    const shell = section.querySelector(".inline-avatar") as HTMLElement;
    expect(shell.querySelector("img")).toBeTruthy();
    const placeholder = section.querySelector(".character-placeholder") as HTMLElement;
    expect(placeholder.style.display).not.toBe("none");
  });

  it("hides unknown mid-sentence-speaker placeholders (no generic avatar)", () => {
    // Only generic-avatar exists; "cottagers" is unknown
    mockGetCharactersData.mockReturnValue([GENERIC_AVATAR]);

    const section = parseSection(`
      <section data-chapter="20">
        <p data-index="10">
          <span data-speaker="the-creature-frankensteins-monster-the-daemon" class="has-speaker">
            I heard them utter the words
            <span data-speaker="cottagers" class="has-speaker">
              <span class="character-placeholder character-talking mid-sentence-speaker"
                    data-character="cottagers"
                    data-is-talking="false" data-media-injected="false">
                <span class="inline-avatar" data-character="cottagers" title="Cottagers"></span>
              </span>
              'good spirit,'
            </span>
            <span data-speaker="cottagers" class="has-speaker">
              <span class="character-placeholder character-talking mid-sentence-speaker"
                    data-character="cottagers"
                    data-is-talking="false" data-media-injected="false">
                <span class="inline-avatar" data-character="cottagers" title="Cottagers"></span>
              </span>
              'wonderful'
            </span>
          </span>
        </p>
      </section>
    `);

    hydrateInlineAvatarsInSection(section);

    const placeholders = section.querySelectorAll<HTMLElement>(
      ".character-placeholder.mid-sentence-speaker",
    );
    expect(placeholders).toHaveLength(2);

    placeholders.forEach((placeholder) => {
      // Placeholder should be hidden
      expect(placeholder.style.display).toBe("none");
      // Shell should NOT have an img injected
      const shell = placeholder.querySelector(".inline-avatar");
      expect(shell?.querySelector("img")).toBeFalsy();
    });
  });

  it("still shows mid-sentence-speaker avatars for known characters", () => {
    const felix = makeCharacter("felix-de-lacey", "Felix De Lacey");
    mockGetCharactersData.mockReturnValue([felix, GENERIC_AVATAR]);

    const section = parseSection(`
      <section data-chapter="20">
        <p data-index="10">
          <span data-speaker="the-creature-frankensteins-monster-the-daemon" class="has-speaker">
            those offices that I had seen done by
            <span class="character-placeholder character-talking mid-sentence-speaker"
                  data-character="felix-de-lacey"
                  data-is-talking="false" data-media-injected="false">
              <span class="inline-avatar" data-character="felix-de-lacey" title="Felix"></span>
            </span>
            Felix.
          </span>
        </p>
      </section>
    `);

    hydrateInlineAvatarsInSection(section);

    const placeholder = section.querySelector(
      ".character-placeholder.mid-sentence-speaker",
    ) as HTMLElement;
    // Known character — should still get an avatar
    const shell = placeholder.querySelector(".inline-avatar");
    expect(shell?.querySelector("img")).toBeTruthy();
    // Should NOT be hidden
    expect(placeholder.style.display).not.toBe("none");
  });
});
