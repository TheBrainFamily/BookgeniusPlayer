import { describe, it, expect } from "bun:test";
import { CharacterRegistry } from "../character-registry";

describe("CharacterRegistry", () => {
  describe("register", () => {
    it("registers a character with a generated slug", () => {
      const registry = new CharacterRegistry();
      const entry = registry.register("Hercule Poirot", 1, "Belgian detective");

      expect(entry.slug).toBe("hercule-poirot");
      expect(entry.name).toBe("Hercule Poirot");
      expect(entry.description).toBe("Belgian detective");
      expect(entry.firstSeenChapter).toBe(1);
      expect(entry.aliases).toEqual([]);
    });

    it("returns existing entry for duplicate registration", () => {
      const registry = new CharacterRegistry();
      const first = registry.register("Hercule Poirot", 1);
      const second = registry.register("Hercule Poirot", 3);

      expect(first).toBe(second);
      expect(registry.size).toBe(1);
    });

    it("handles names with diacritics", () => {
      const registry = new CharacterRegistry();
      const entry = registry.register("Stanisław Wokulski", 1);

      expect(entry.slug).toBe("stanislaw-wokulski");
    });

    it("prefixes slugs that start with non-alpha", () => {
      const registry = new CharacterRegistry();
      const entry = registry.register("42nd Guard", 1);

      expect(entry.slug).toBe("c-42nd-guard");
    });
  });

  describe("registerWithSlug", () => {
    it("registers with a pre-determined slug", () => {
      const registry = new CharacterRegistry();
      const entry = registry.registerWithSlug("dr-sheppard", "Dr. Sheppard", 1);

      expect(entry.slug).toBe("dr-sheppard");
      expect(entry.name).toBe("Dr. Sheppard");
    });

    it("updates name if new one is more descriptive", () => {
      const registry = new CharacterRegistry();
      registry.registerWithSlug("dr-sheppard", "dr-sheppard", 1);
      const updated = registry.registerWithSlug("dr-sheppard", "Dr. James Sheppard", 2);

      expect(updated.name).toBe("Dr. James Sheppard");
    });

    it("keeps existing name if new one is the slug itself", () => {
      const registry = new CharacterRegistry();
      registry.registerWithSlug("dr-sheppard", "Dr. Sheppard", 1);
      const same = registry.registerWithSlug("dr-sheppard", "dr-sheppard", 2);

      expect(same.name).toBe("Dr. Sheppard");
    });
  });

  describe("addAlias", () => {
    it("adds alias and makes it findable", () => {
      const registry = new CharacterRegistry();
      registry.register("Hercule Poirot", 1);
      registry.addAlias("hercule-poirot", "the little Belgian");

      const found = registry.findByAlias("the little Belgian");
      expect(found).toBeDefined();
      expect(found!.slug).toBe("hercule-poirot");
    });

    it("does not add duplicate aliases", () => {
      const registry = new CharacterRegistry();
      registry.register("Hercule Poirot", 1);
      registry.addAlias("hercule-poirot", "Poirot");
      registry.addAlias("hercule-poirot", "Poirot");

      expect(registry.get("hercule-poirot")!.aliases).toEqual(["Poirot"]);
    });

    it("does nothing for unknown slug", () => {
      const registry = new CharacterRegistry();
      registry.addAlias("nonexistent", "alias");

      expect(registry.size).toBe(0);
    });
  });

  describe("findByAlias", () => {
    it("finds by name (case-insensitive)", () => {
      const registry = new CharacterRegistry();
      registry.register("Hercule Poirot", 1);

      expect(registry.findByAlias("hercule poirot")).toBeDefined();
      expect(registry.findByAlias("HERCULE POIROT")).toBeDefined();
    });

    it("returns undefined for unknown name", () => {
      const registry = new CharacterRegistry();
      expect(registry.findByAlias("nobody")).toBeUndefined();
    });
  });

  describe("linkIdentity", () => {
    it("links identity and copies aliases", () => {
      const registry = new CharacterRegistry();
      registry.register("Mysterious Stranger", 3);
      registry.addAlias("mysterious-stranger", "the stranger");
      registry.register("Inspector Japp", 5);

      registry.linkIdentity({
        newSlug: "inspector-japp",
        previousSlug: "mysterious-stranger",
        chapterNumber: 5,
      });

      const japp = registry.get("inspector-japp")!;
      expect(japp.aliases).toContain("Mysterious Stranger");
      expect(japp.aliases).toContain("the stranger");

      // Old name should now resolve to new slug
      expect(registry.findByAlias("Mysterious Stranger")?.slug).toBe("inspector-japp");
    });
  });

  describe("toPromptContext", () => {
    it("returns placeholder when empty", () => {
      const registry = new CharacterRegistry();
      expect(registry.toPromptContext()).toBe("No characters discovered yet.");
    });

    it("lists characters with aliases and reveals", () => {
      const registry = new CharacterRegistry();
      registry.register("Hercule Poirot", 1);
      registry.addAlias("hercule-poirot", "Poirot");
      registry.register("Mysterious Stranger", 3);
      registry.register("Inspector Japp", 5);
      registry.linkIdentity({
        newSlug: "inspector-japp",
        previousSlug: "mysterious-stranger",
        chapterNumber: 5,
      });

      const context = registry.toPromptContext();
      expect(context).toContain("hercule-poirot");
      expect(context).toContain("aliases: Poirot");
      expect(context).toContain("Identity reveals:");
      expect(context).toContain('"mysterious-stranger" revealed as "inspector-japp"');
    });
  });

  describe("toJSON", () => {
    it("serializes characters and reveals", () => {
      const registry = new CharacterRegistry();
      registry.register("Hercule Poirot", 1);
      registry.linkIdentity({
        newSlug: "hercule-poirot",
        previousSlug: "old-slug",
        chapterNumber: 2,
      });

      const json = registry.toJSON();
      expect(json.characters).toHaveLength(1);
      expect(json.reveals).toHaveLength(1);
      expect(json.characters[0].slug).toBe("hercule-poirot");
    });
  });
});
