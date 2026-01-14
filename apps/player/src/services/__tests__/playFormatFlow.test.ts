/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  normalizeChapterHtml,
  injectDataIndex,
  injectAvatarShells,
  countParagraphs,
} from "../htmlNormalizer";

const SOURCE_HTML = `<section data-chapter="1">
    <h3 data-act="true">ACT I</h3>
    <h4>SCENE I.</h4>
    <h5>Venice. A street.</h5>
 <div class="play-row didaskalia-row">
  <div class="didaskalia-text">
    <p data-is-didaskalia="true">
      <span id="ch1-p0-s1"><em>Enter <span data-enters="true" data-c="roderigo">RODERIGO</span> and <span data-enters="true" data-c="iago">IAGO</span></em></span>
    </p>
  </div>
 </div>
 <div data-speaker="roderigo" class="play-row" data-text-alignment="left">
  <div class="character-avatar"></div>
  <div class="character-text">
    <p data-text-alignment="left" data-is-character="true" data-is-didaskalia="false">
      <span id="ch1-p1-s1"><strong>RODERIGO</strong></span>
    </p>
    <p data-text-alignment="left" data-is-character="false" data-is-didaskalia="false">
      <span id="ch1-p2-s1">Tush! never tell me; I take it much unkindly</span>
    </p>
    <p data-text-alignment="left" data-is-character="false" data-is-didaskalia="false">
      <span id="ch1-p3-s1">That thou, <span data-c="iago">Iago</span>, who hast had my purse</span>
    </p>
    <p data-text-alignment="left" data-is-character="false" data-is-didaskalia="false">
      <span id="ch1-p4-s1">As if the strings were thine, shouldst know of this.</span>
    </p>
  </div>
 </div>
 <div data-speaker="iago" class="play-row" data-text-alignment="right">
  <div class="character-avatar"></div>
  <div class="character-text">
    <p data-text-alignment="right" data-is-character="true" data-is-didaskalia="false">
      <span id="ch1-p5-s1"><strong>IAGO</strong></span>
    </p>
    <p data-text-alignment="right" data-is-character="false" data-is-didaskalia="false">
      <span id="ch1-p6-s1">'Sblood, but you will not hear me:</span>
    </p>
    <p data-text-alignment="right" data-is-character="false" data-is-didaskalia="false">
      <span id="ch1-p7-s1">If ever I did dream of such a matter, Abhor me.</span>
    </p>
  </div>
 </div>
</section>`;

describe("Play Format Flow - Step by Step", () => {
  let doc: Document;
  let section: Element;

  beforeEach(() => {
    const parser = new DOMParser();
    doc = parser.parseFromString(SOURCE_HTML, "text/html");
    section = doc.querySelector("section[data-chapter]")!;
  });

  describe("Step 1: Source HTML Structure", () => {
    it("has correct base structure", () => {
      expect(section).toBeTruthy();
      expect(section.getAttribute("data-chapter")).toBe("1");
    });

    it("has headings as direct children", () => {
      const h3 = section.querySelector("h3");
      const h4 = section.querySelector("h4");
      const h5 = section.querySelector("h5");
      expect(h3?.parentElement).toBe(section);
      expect(h4?.parentElement).toBe(section);
      expect(h5?.parentElement).toBe(section);
    });

    it("has play-rows with character-avatar and character-text", () => {
      const playRows = section.querySelectorAll(".play-row");
      expect(playRows.length).toBe(3);

      const speakerRow = section.querySelector('[data-speaker="roderigo"]');
      expect(speakerRow?.querySelector(".character-avatar")).toBeTruthy();
      expect(speakerRow?.querySelector(".character-text")).toBeTruthy();
    });

    it("has empty character-avatar divs initially", () => {
      const avatarContainers = section.querySelectorAll(".character-avatar");
      avatarContainers.forEach((container) => {
        expect(container.children.length).toBe(0);
      });
    });

    it("has paragraphs inside character-text WITHOUT data-index", () => {
      const paragraphs = section.querySelectorAll(".character-text p");
      paragraphs.forEach((p) => {
        expect(p.hasAttribute("data-index")).toBe(false);
      });
    });
  });

  describe("Step 2: injectDataIndex", () => {
    beforeEach(() => {
      injectDataIndex(section);
    });

    it("adds data-index to h3, h4, h5 headings", () => {
      expect(section.querySelector("h3")?.getAttribute("data-index")).toBe("0");
      expect(section.querySelector("h4")?.getAttribute("data-index")).toBe("1");
      expect(section.querySelector("h5")?.getAttribute("data-index")).toBe("2");
    });

    it("adds data-index to paragraphs inside didaskalia-text", () => {
      const didaskaliaP = section.querySelector(".didaskalia-text p");
      expect(didaskaliaP?.getAttribute("data-index")).toBe("3");
    });

    it("adds data-index to paragraphs inside character-text", () => {
      const roderigo = section.querySelector('[data-speaker="roderigo"] .character-text');
      const paragraphs = roderigo?.querySelectorAll("p");
      expect(paragraphs?.[0].getAttribute("data-index")).toBe("4");
      expect(paragraphs?.[1].getAttribute("data-index")).toBe("5");
      expect(paragraphs?.[2].getAttribute("data-index")).toBe("6");
      expect(paragraphs?.[3].getAttribute("data-index")).toBe("7");
    });

    it("continues sequential indexing across play-rows", () => {
      const iago = section.querySelector('[data-speaker="iago"] .character-text');
      const paragraphs = iago?.querySelectorAll("p");
      expect(paragraphs?.[0].getAttribute("data-index")).toBe("8");
      expect(paragraphs?.[1].getAttribute("data-index")).toBe("9");
      expect(paragraphs?.[2].getAttribute("data-index")).toBe("10");
    });

    it("does NOT add data-index to play-row divs", () => {
      const playRows = section.querySelectorAll(".play-row");
      playRows.forEach((row) => {
        expect(row.hasAttribute("data-index")).toBe(false);
      });
    });

    it("total paragraph count matches", () => {
      const count = countParagraphs(section);
      expect(count).toBe(11); // 3 headings + 1 didaskalia + 4 roderigo + 3 iago
    });
  });

  describe("Step 3: injectAvatarShells", () => {
    beforeEach(() => {
      injectDataIndex(section);
      injectAvatarShells(section, doc);
    });

    it("adds has-speaker class to play-rows with data-speaker", () => {
      const roderigo = section.querySelector('[data-speaker="roderigo"]');
      const iago = section.querySelector('[data-speaker="iago"]');
      expect(roderigo?.classList.contains("has-speaker")).toBe(true);
      expect(iago?.classList.contains("has-speaker")).toBe(true);
    });

    it("does NOT add has-speaker to didaskalia rows", () => {
      const didaskalia = section.querySelector(".didaskalia-row");
      expect(didaskalia?.classList.contains("has-speaker")).toBe(false);
    });

    it("injects character-placeholder into character-avatar container", () => {
      const roderigoAvatar = section.querySelector('[data-speaker="roderigo"] .character-avatar');
      const placeholder = roderigoAvatar?.querySelector(".character-placeholder");
      expect(placeholder).toBeTruthy();
      expect(placeholder?.getAttribute("data-character")).toBe("roderigo");
      expect(placeholder?.getAttribute("data-is-talking")).toBe("true");
    });

    it("character-placeholder has correct classes", () => {
      const placeholder = section.querySelector(".character-placeholder");
      expect(placeholder?.classList.contains("character-talking")).toBe(true);
      expect(placeholder?.classList.contains("start-of-paragraph")).toBe(true);
    });

    it("character-placeholder does NOT have inline-avatar yet", () => {
      const placeholder = section.querySelector(".character-placeholder");
      const inlineAvatar = placeholder?.querySelector(".inline-avatar");
      expect(inlineAvatar).toBeFalsy();
    });

    it("adds character-highlighted class to data-c spans", () => {
      const mentions = section.querySelectorAll("span[data-c]");
      mentions.forEach((mention) => {
        expect(mention.classList.contains("character-highlighted")).toBe(true);
      });
    });

    it("adds data-character attribute to data-c spans", () => {
      const iagoMention = section.querySelector('span[data-c="iago"]');
      expect(iagoMention?.getAttribute("data-character")).toBe("iago");
    });
  });

  describe("Step 4: normalizeChapterHtml (full pipeline)", () => {
    it("produces correct structure from source HTML", () => {
      const result = normalizeChapterHtml(SOURCE_HTML);
      const parser = new DOMParser();
      const resultDoc = parser.parseFromString(result, "text/html");
      const resultSection = resultDoc.querySelector("section[data-chapter]");

      expect(resultSection).toBeTruthy();

      // Check data-index on headings
      expect(resultSection?.querySelector("h3")?.getAttribute("data-index")).toBe("0");

      // Check data-index on paragraphs
      const firstP = resultSection?.querySelector('.character-text p[data-index="4"]');
      expect(firstP).toBeTruthy();

      // Check character-placeholder exists
      const placeholder = resultSection?.querySelector(".character-placeholder");
      expect(placeholder).toBeTruthy();
      expect(placeholder?.getAttribute("data-character")).toBe("roderigo");
    });
  });

  describe("Step 5: Simulated Media Activation", () => {
    let container: HTMLElement;

    beforeEach(() => {
      const normalized = normalizeChapterHtml(SOURCE_HTML);
      container = document.createElement("div");
      container.id = "content-container";
      container.innerHTML = normalized;
      document.body.appendChild(container);
    });

    afterEach(() => {
      container.remove();
    });

    it("can find paragraphs by data-index selector", () => {
      const p4 = container.querySelector('[data-index="4"]');
      expect(p4).toBeTruthy();
      expect(p4?.tagName.toLowerCase()).toBe("p");
    });

    it("can find character-placeholder from paragraph", () => {
      const p4 = container.querySelector('[data-index="4"]');
      const playRow = p4?.closest(".play-row");
      const placeholder = playRow?.querySelector(".character-placeholder");
      expect(placeholder).toBeTruthy();
      expect(placeholder?.getAttribute("data-character")).toBe("roderigo");
    });

    it("can navigate from paragraph to character-avatar container", () => {
      const p4 = container.querySelector('[data-index="4"]');
      const playRow = p4?.closest(".play-row");
      const avatarContainer = playRow?.querySelector(".character-avatar");
      expect(avatarContainer).toBeTruthy();
      expect(avatarContainer?.querySelector(".character-placeholder")).toBeTruthy();
    });

    it("simulates creating inline-avatar with img", () => {
      const placeholder = container.querySelector(".character-placeholder") as HTMLElement;
      expect(placeholder).toBeTruthy();

      // Simulate what activateMediaInRange should do
      const inlineAvatar = document.createElement("span");
      inlineAvatar.classList.add("inline-avatar", "relative", "w-full", "h-full");
      inlineAvatar.dataset.character = placeholder.dataset.character!;
      inlineAvatar.title = "Roderigo";

      const img = document.createElement("img");
      img.src = "https://example.com/avatar.png";
      img.alt = "Roderigo";
      inlineAvatar.appendChild(img);

      placeholder.appendChild(inlineAvatar);

      // Verify structure
      const result = placeholder.querySelector(".inline-avatar");
      expect(result).toBeTruthy();
      expect(result?.querySelector("img")).toBeTruthy();
      expect(result?.getAttribute("data-character")).toBe("roderigo");
    });

    it("simulates cleanup and re-activation cycle", () => {
      const placeholder = container.querySelector(".character-placeholder") as HTMLElement;
      const playRow = placeholder.closest(".play-row") as HTMLElement;

      // Step 1: Initial activation - create inline-avatar with img
      const inlineAvatar = document.createElement("span");
      inlineAvatar.classList.add("inline-avatar", "relative", "w-full", "h-full");
      inlineAvatar.dataset.character = "roderigo";
      inlineAvatar.title = "Roderigo";

      const img = document.createElement("img");
      img.src = "https://example.com/avatar.png";
      img.alt = "Roderigo";
      inlineAvatar.appendChild(img);

      placeholder.appendChild(inlineAvatar);
      playRow.dataset.activatedMedia = "true";

      expect(placeholder.querySelector(".inline-avatar img")).toBeTruthy();

      // Step 2: Cleanup - create dummy and replace
      const existingInlineAvatar = placeholder.querySelector(".inline-avatar") as HTMLElement;
      const dummyElement = document.createElement("span");
      dummyElement.classList.add("dummy-avatar-placeholder", "inline-avatar");

      // CRITICAL: Copy data-character and title from existing inline-avatar
      if (existingInlineAvatar?.dataset.character) {
        dummyElement.dataset.character = existingInlineAvatar.dataset.character;
      }
      if (existingInlineAvatar?.title) {
        dummyElement.title = existingInlineAvatar.title;
      }

      const existingImg = placeholder.querySelector("img");
      if (existingImg) {
        dummyElement.appendChild(existingImg.cloneNode(true));
      }

      placeholder.replaceChildren(dummyElement);
      playRow.dataset.activatedMedia = "false";

      // Verify dummy has correct attributes
      const dummy = placeholder.querySelector(".inline-avatar") as HTMLElement;
      expect(dummy.classList.contains("dummy-avatar-placeholder")).toBe(true);
      expect(dummy.dataset.character).toBe("roderigo");
      expect(dummy.title).toBe("Roderigo");
      expect(dummy.querySelector("img")).toBeTruthy();

      // Step 3: Re-activation - populate the dummy shell
      const shell = placeholder.querySelector(".inline-avatar") as HTMLElement;
      const hasImg = shell.querySelector("img");

      // If already has img, should skip (which is correct)
      expect(hasImg).toBeTruthy();

      // If no img, should be able to populate
      if (!hasImg) {
        const characterSlug = shell.dataset.character;
        expect(characterSlug).toBe("roderigo"); // This should NOT be undefined
      }
    });

    it("simulates cleanup WITHOUT img - must preserve data-character", () => {
      const placeholder = container.querySelector(".character-placeholder") as HTMLElement;
      const playRow = placeholder.closest(".play-row") as HTMLElement;

      // Step 1: Initial activation - create inline-avatar WITHOUT img (edge case)
      const inlineAvatar = document.createElement("span");
      inlineAvatar.classList.add("inline-avatar", "relative", "w-full", "h-full");
      inlineAvatar.dataset.character = "roderigo";
      inlineAvatar.title = "Roderigo";
      // No img added - simulating a failure scenario

      placeholder.appendChild(inlineAvatar);
      playRow.dataset.activatedMedia = "true";

      // Step 2: Cleanup
      const existingInlineAvatar = placeholder.querySelector(".inline-avatar") as HTMLElement;
      const dummyElement = document.createElement("span");
      dummyElement.classList.add("dummy-avatar-placeholder", "inline-avatar");

      if (existingInlineAvatar?.dataset.character) {
        dummyElement.dataset.character = existingInlineAvatar.dataset.character;
      }
      if (existingInlineAvatar?.title) {
        dummyElement.title = existingInlineAvatar.title;
      }

      // No img to clone

      placeholder.replaceChildren(dummyElement);
      playRow.dataset.activatedMedia = "false";

      // Step 3: Re-activation - dummy has no img, should populate
      const shell = placeholder.querySelector(".inline-avatar") as HTMLElement;
      const hasImg = shell.querySelector("img");
      expect(hasImg).toBeFalsy();

      // CRITICAL: data-character must exist for re-population to work
      const characterSlug = shell.dataset.character;
      expect(characterSlug).toBe("roderigo");
      expect(shell.title).toBe("Roderigo");

      // Now we can populate
      if (!hasImg && characterSlug) {
        const newImg = document.createElement("img");
        newImg.src = "https://example.com/avatar.png";
        newImg.alt = shell.title;
        shell.appendChild(newImg);
      }

      expect(shell.querySelector("img")).toBeTruthy();
    });
  });
});
