import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import componentSchema from "./components/asset-manager/schema";
import { modules as componentModules } from "./components/asset-manager/test.setup";

// @ts-expect-error this is only used in tests
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("Kanban over asset manager", () => {
  it("createBoard creates default columns under kanban/<boardSlug>", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("assetManager", componentSchema, componentModules);

    const board = await t.mutation(api.kanban.createBoard, {
      boardSlug: "demo",
    });

    // createBoard returns boardSlug + columns for convenience
    expect(board.boardSlug).toBe("demo");
    expect(board.columns.map((c: any) => c.slug)).toEqual([
      "backlog",
      "doing",
      "review",
      "done",
    ]);

    // And listColumns sees the same structure
    const columns = await t.query(api.kanban.listColumns, {
      boardSlug: "demo",
    });

    expect(columns.map((c: any) => c.slug)).toEqual([
      "backlog",
      "doing",
      "review",
      "done",
    ]);
  });

  it("createCard creates a published card in the given column", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("assetManager", componentSchema, componentModules);

    await t.mutation(api.kanban.createBoard, {
      boardSlug: "demo",
    });

    const card = await t.mutation(api.kanban.createCard, {
      boardSlug: "demo",
      column: "backlog",
      title: "First card",
      description: "Hello world",
    });

    expect(card.boardSlug).toBe("demo");
    expect(card.column).toBe("backlog");
    expect(typeof card.basename).toBe("string");
    expect(card.version).toBe(1);

    const backlogCards = await t.query(api.kanban.listColumnCards, {
      boardSlug: "demo",
      column: "backlog",
    });

    expect(backlogCards).toHaveLength(1);
    expect(backlogCards[0].title).toBe("First card");
    expect(backlogCards[0].column).toBe("backlog");
    expect(backlogCards[0].boardSlug).toBe("demo");
    expect(backlogCards[0].version).toBe(1);
  });

  it("updateCard creates a new published version with updated content", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("assetManager", componentSchema, componentModules);

    await t.mutation(api.kanban.createBoard, {
      boardSlug: "demo",
    });

    const card = await t.mutation(api.kanban.createCard, {
      boardSlug: "demo",
      column: "backlog",
      title: "First card",
      description: "v1",
    });

    const updated = await t.mutation(api.kanban.updateCard, {
      boardSlug: "demo",
      column: "backlog",
      basename: card.basename,
      title: "First card (edited)",
      description: "v2",
    });

    expect(updated.version).toBe(2);

    const backlogCards = await t.query(api.kanban.listColumnCards, {
      boardSlug: "demo",
      column: "backlog",
    });

    expect(backlogCards).toHaveLength(1);
    const c = backlogCards[0];
    expect(c.basename).toBe(card.basename);
    expect(c.version).toBe(2);
    expect(c.title).toBe("First card (edited)");
    expect(c.description).toBe("v2");
  });

  it("moveCard moves a card from one column to another", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("assetManager", componentSchema, componentModules);

    await t.mutation(api.kanban.createBoard, {
      boardSlug: "demo",
    });

    const card = await t.mutation(api.kanban.createCard, {
      boardSlug: "demo",
      column: "backlog",
      title: "Move me",
      description: "In backlog",
    });

    // Sanity: backlog has the card, doing is empty
    let backlogCards = await t.query(api.kanban.listColumnCards, {
      boardSlug: "demo",
      column: "backlog",
    });
    let doingCards = await t.query(api.kanban.listColumnCards, {
      boardSlug: "demo",
      column: "doing",
    });

    expect(backlogCards.map((c: any) => c.basename)).toEqual([card.basename]);
    expect(doingCards).toHaveLength(0);

    // Move the card
    await t.mutation(api.kanban.moveCard, {
      boardSlug: "demo",
      fromColumn: "backlog",
      toColumn: "doing",
      basename: card.basename,
    });

    backlogCards = await t.query(api.kanban.listColumnCards, {
      boardSlug: "demo",
      column: "backlog",
    });
    doingCards = await t.query(api.kanban.listColumnCards, {
      boardSlug: "demo",
      column: "doing",
    });

    expect(backlogCards).toHaveLength(0);
    expect(doingCards).toHaveLength(1);
    expect(doingCards[0].basename).toBe(card.basename);
    expect(doingCards[0].title).toBe("Move me");
    expect(doingCards[0].column).toBe("doing");
  });

  it("listColumnCards returns empty array for unknown board or column", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("assetManager", componentSchema, componentModules);

    const cards = await t.query(api.kanban.listColumnCards, {
      boardSlug: "does-not-exist",
      column: "backlog",
    });

    expect(cards).toEqual([]);
  });

  it("moveCard tracks movement history that can be queried", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("assetManager", componentSchema, componentModules);

    await t.mutation(api.kanban.createBoard, { boardSlug: "demo" });

    const card = await t.mutation(api.kanban.createCard, {
      boardSlug: "demo",
      column: "backlog",
      title: "Track me",
      description: "Watch my journey",
    });

    // Move: backlog -> doing
    await t.mutation(api.kanban.moveCard, {
      boardSlug: "demo",
      fromColumn: "backlog",
      toColumn: "doing",
      basename: card.basename,
    });

    // Move: doing -> review
    await t.mutation(api.kanban.moveCard, {
      boardSlug: "demo",
      fromColumn: "doing",
      toColumn: "review",
      basename: card.basename,
    });

    // Query history from the card's current location
    const history = await t.query(api.kanban.getCardHistory, {
      boardSlug: "demo",
      column: "review",
      basename: card.basename,
    });

    expect(history).toHaveLength(2);

    expect(history[0].type).toBe("move");
    expect(history[0].fromColumn).toBe("backlog");
    expect(history[0].toColumn).toBe("doing");

    expect(history[1].type).toBe("move");
    expect(history[1].fromColumn).toBe("doing");
    expect(history[1].toColumn).toBe("review");
  });
});
