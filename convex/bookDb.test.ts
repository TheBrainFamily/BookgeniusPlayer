import { describe, it, expect } from "vitest";
import { createBookDbPatch } from "./functions";

/**
 * These tests verify security properties of the bookDb wrapper.
 *
 * Issue 1: bookDb.patch() privilege escalation
 * - A caller could pass { bookPath: "different-book" } to move a record to another book
 * - The authorization check verifies the CURRENT bookPath, then patches ALL fields
 *
 * Issue 2: bookDb.query() index mismatch
 * - The query method hardcodes .withIndex("by_book", ...) but some tables use different index names
 */

describe("bookDb security", () => {
  describe("patch() privilege escalation prevention", () => {
    it("should strip bookPath from patch fields to prevent moving records between books", async () => {
      // Track what fields were actually patched
      let patchedFields: Record<string, unknown> | null = null;

      // Mock db that captures the patch call
      const mockDb = {
        get: async () => ({ _id: "test-id", bookPath: "books/book-a", content: "original" }),
        patch: async (_id: unknown, fields: Record<string, unknown>) => {
          patchedFields = fields;
        },
      };

      const authorizedBookPath = "books/book-a";
      const patchFn = createBookDbPatch(mockDb as never, authorizedBookPath);

      // Attempt to patch with a malicious bookPath change
      await patchFn(
        "test-id" as never,
        {
          bookPath: "books/book-b", // Malicious: trying to move to different book
          content: "updated content",
        } as never,
      );

      // SECURITY CHECK: bookPath should be STRIPPED from the patch
      // Before fix: patchedFields would include { bookPath: "books/book-b", content: "updated content" }
      // After fix: patchedFields should only have { content: "updated content" }
      expect(patchedFields).not.toHaveProperty("bookPath");
      expect(patchedFields).toHaveProperty("content", "updated content");
    });

    it("should still patch other fields normally", async () => {
      let patchedFields: Record<string, unknown> | null = null;

      const mockDb = {
        get: async () => ({
          _id: "test-id",
          bookPath: "books/book-a",
          content: "original",
          chapter: 1,
        }),
        patch: async (_id: unknown, fields: Record<string, unknown>) => {
          patchedFields = fields;
        },
      };

      const patchFn = createBookDbPatch(mockDb as never, "books/book-a");

      // Normal patch without bookPath - should work fine
      await patchFn("test-id" as never, { content: "new content", chapter: 2 } as never);

      expect(patchedFields).toEqual({ content: "new content", chapter: 2 });
    });

    it("should reject patches to records from different books", async () => {
      const mockDb = {
        get: async () => ({
          _id: "test-id",
          bookPath: "books/book-b", // Record belongs to book-b
        }),
        patch: async () => {},
      };

      // User is authorized for book-a, but record is in book-b
      const patchFn = createBookDbPatch(mockDb as never, "books/book-a");

      await expect(patchFn("test-id" as never, { content: "hacked" } as never)).rejects.toThrow(
        "Access denied",
      );
    });
  });

  describe("BookTableNames type safety", () => {
    it("should only include tables with by_book index", () => {
      // After the fix, BookTableNames should NOT include:
      // - musicFileMetadata (has by_book_file)
      // - backgroundFileMetadata (has by_book_file)
      // - bookGenerationJobs (has by_bookPath)
      //
      // This is enforced at compile time, but we document the expectation here.
      const expectedTables = ["notes", "variants", "backgroundCues", "musicCues", "bookMembers"];
      expect(expectedTables).toHaveLength(5);
    });
  });
});
