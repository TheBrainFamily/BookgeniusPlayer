/**
 * Custom function builders for BookGenius.
 *
 * Use these instead of importing directly from _generated/server:
 * - bookMutation: For mutations that modify book data (auto-enforces auth)
 * - publicQuery: For queries that don't require auth
 * - publicMutation: For mutations that don't require auth (use sparingly)
 * - internalMutation/Action/Query: For internal functions (unchanged)
 */
import { v } from "convex/values";
import {
  query as baseQuery,
  mutation as baseMutation,
  action as baseAction,
  internalMutation as baseInternalMutation,
  internalAction as baseInternalAction,
  internalQuery as baseInternalQuery,
} from "./_generated/server";
import type { Doc, Id, DataModel } from "./_generated/dataModel";
import type { Query, NamedTableInfo } from "convex/server";
import { customMutation, customAction, customQuery } from "convex-helpers/server/customFunctions";
import {
  requireBookWriteAccess,
  requireBookWriteAccessFromAction,
  type BookRole,
} from "./bookAuthz";
import { requireIdentity, requireAdmin, principalId, isAdmin } from "./authz";

// ============================================================================
// Type definitions
// ============================================================================

/**
 * Tables that have a bookPath field and can be used with bookDb operations.
 */
export type BookTableNames =
  | "notes"
  | "variants"
  | "backgroundCues"
  | "musicCues"
  | "musicFileMetadata"
  | "backgroundFileMetadata"
  | "bookMembers"
  | "bookGenerationJobs";

/**
 * Fields that are auto-added by bookDb.insert (don't include in insert calls).
 */
type InsertDoc<T extends BookTableNames> = Omit<Doc<T>, "_id" | "_creationTime" | "bookPath">;

/**
 * Wrapped database that auto-verifies bookPath on all operations.
 * Fully typed - compile-time errors if you pass wrong field types.
 */
export interface BookDb {
  /**
   * Get a record by ID. Verifies it belongs to the authorized book.
   * Returns null if not found.
   * @throws Error if record belongs to different book
   */
  get: <T extends BookTableNames>(id: Id<T>) => Promise<Doc<T> | null>;

  /**
   * Patch a record. Verifies it belongs to the authorized book first.
   * @throws Error if not found or belongs to different book
   */
  patch: <T extends BookTableNames>(id: Id<T>, fields: Partial<Doc<T>>) => Promise<void>;

  /**
   * Delete a record. Verifies it belongs to the authorized book first.
   * @throws Error if not found or belongs to different book
   */
  delete: <T extends BookTableNames>(id: Id<T>) => Promise<void>;

  /**
   * Insert a record. Auto-adds bookPath to the document.
   * You should NOT include bookPath in the doc - it's added automatically.
   */
  insert: <T extends BookTableNames>(table: T, doc: InsertDoc<T>) => Promise<Id<T>>;

  /**
   * Query a table. Auto-filters by bookPath using the by_book index.
   * Returns a fully typed Convex query builder that you can chain with .filter(), .collect(), etc.
   */
  query: <T extends BookTableNames>(table: T) => Query<NamedTableInfo<DataModel, T>>;
}

/**
 * Context available in bookMutation handlers.
 */
export interface BookMutationCtx {
  /** User's stable identifier (tokenIdentifier) */
  principalId: string;
  /** User's role for this book */
  role: BookRole;
  /** The authorized book path */
  bookPath: string;
  /** Wrapped database that enforces bookPath on all operations */
  bookDb: BookDb;
}

// ============================================================================
// Book Mutation
// ============================================================================

/**
 * Book mutation - requires bookPath arg and validates write access.
 *
 * Provides ctx.bookDb which auto-verifies all operations are scoped to the book.
 * Full type safety - compile-time errors if you pass wrong field types.
 *
 * @example
 * export const create = bookMutation({
 *   args: { fileBasename: v.string(), chapter: v.number() },
 *   handler: async (ctx, { fileBasename, chapter }) => {
 *     // bookDb.insert auto-adds bookPath, type-checked against schema
 *     return await ctx.bookDb.insert("backgroundCues", { fileBasename, chapter, paragraph: 0 });
 *   },
 * });
 */
export const bookMutation = customMutation(baseMutation, {
  args: { bookPath: v.string(), _adminKey: v.optional(v.string()) },
  input: async (ctx, { bookPath, _adminKey }) => {
    const { principalId, role } = await requireBookWriteAccess(ctx, bookPath, _adminKey);

    // Create typed wrapper for database operations
    const bookDb: BookDb = {
      get: async <T extends BookTableNames>(id: Id<T>): Promise<Doc<T> | null> => {
        const record = await ctx.db.get(id);
        if (record) {
          // All BookTableNames have bookPath field
          const recordWithBookPath = record as Doc<T> & { bookPath: string };
          if (recordWithBookPath.bookPath !== bookPath) {
            throw new Error("Access denied: record belongs to different book");
          }
        }
        return record as Doc<T> | null;
      },

      patch: async <T extends BookTableNames>(
        id: Id<T>,
        fields: Partial<Doc<T>>,
      ): Promise<void> => {
        const record = await ctx.db.get(id);
        if (!record) throw new Error("Not found");
        const recordWithBookPath = record as Doc<T> & { bookPath: string };
        if (recordWithBookPath.bookPath !== bookPath) {
          throw new Error("Access denied: record belongs to different book");
        }
        await ctx.db.patch(id, fields);
      },

      delete: async <T extends BookTableNames>(id: Id<T>): Promise<void> => {
        const record = await ctx.db.get(id);
        if (!record) throw new Error("Not found");
        const recordWithBookPath = record as Doc<T> & { bookPath: string };
        if (recordWithBookPath.bookPath !== bookPath) {
          throw new Error("Access denied: record belongs to different book");
        }
        await ctx.db.delete(id);
      },

      insert: async <T extends BookTableNames>(table: T, doc: InsertDoc<T>): Promise<Id<T>> => {
        // Add bookPath automatically
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docWithBookPath = { ...doc, bookPath } as any;
        return await ctx.db.insert(table, docWithBookPath);
      },

      query: <T extends BookTableNames>(table: T): Query<NamedTableInfo<DataModel, T>> => {
        // Auto-filter by bookPath using the by_book index
        // All BookTableNames have by_book index, but TS can't verify this constraint
        return ctx.db
          .query(table)
          .withIndex("by_book", (q) => q.eq("bookPath", bookPath as never)) as Query<
          NamedTableInfo<DataModel, T>
        >;
      },
    };

    return {
      ctx: { principalId, role, bookPath, bookDb },
      args: {}, // bookPath consumed by wrapper, not passed to handler
    };
  },
});

// ============================================================================
// Public functions (no auth required)
// ============================================================================

/**
 * Public query - no authentication required.
 * Use for reading published book content, assets, etc.
 */
export const publicQuery = baseQuery;

/**
 * Public mutation - no authentication required.
 * Use sparingly - only for truly public operations.
 */
export const publicMutation = baseMutation;

// ============================================================================
// Internal functions (re-exported unchanged)
// ============================================================================

export const internalMutation = baseInternalMutation;
export const internalAction = baseInternalAction;
export const internalQuery = baseInternalQuery;

// ============================================================================
// Authed functions (require login)
// ============================================================================

/**
 * Authed mutation - requires user to be logged in.
 * Use for user-specific operations that don't need book ownership.
 */
export const authedMutation = customMutation(baseMutation, {
  args: { _adminKey: v.optional(v.string()) },
  input: async (ctx, { _adminKey }) => {
    const identity = await requireIdentity(ctx, _adminKey);
    return {
      ctx: { principalId: principalId(identity), isAdmin: isAdmin(identity), _adminKey },
      args: {},
    };
  },
});

/**
 * Context available in authedMutation handlers.
 */
export interface AuthedMutationCtx {
  principalId: string;
  isAdmin: boolean;
  /** Admin key for nested auth calls (undefined for normal users) */
  _adminKey?: string;
}

// ============================================================================
// Admin functions (require admin role)
// ============================================================================

/**
 * Admin mutation - requires user to be an admin.
 * Use for system management, dangerous operations.
 */
export const adminMutation = customMutation(baseMutation, {
  args: { _adminKey: v.optional(v.string()) },
  input: async (ctx, { _adminKey }) => {
    const identity = await requireAdmin(ctx, _adminKey);
    return { ctx: { principalId: principalId(identity) }, args: {} };
  },
});

/**
 * Admin query - requires user to be an admin.
 * Use for admin-only data access.
 */
export const adminQuery = customQuery(baseQuery, {
  args: { _adminKey: v.optional(v.string()) },
  input: async (ctx, { _adminKey }) => {
    const identity = await requireAdmin(ctx, _adminKey);
    return { ctx: { principalId: principalId(identity) }, args: {} };
  },
});

/**
 * Admin action - requires user to be an admin.
 * Use for admin-only background jobs.
 */
export const adminAction = customAction(baseAction, {
  args: { _adminKey: v.optional(v.string()) },
  input: async (ctx, { _adminKey }) => {
    const identity = await requireAdmin(ctx, _adminKey);
    return { ctx: { principalId: principalId(identity) }, args: {} };
  },
});

/**
 * Context available in admin function handlers.
 */
export interface AdminCtx {
  principalId: string;
}

// ============================================================================
// Public action (no auth, but explicit)
// ============================================================================

/**
 * Public action - no authentication required.
 * Use sparingly - makes it explicit that an action is public.
 */
export const publicAction = baseAction;

// ============================================================================
// Authed action (require login)
// ============================================================================

/**
 * Authed action - requires user to be logged in.
 * Use for user-specific actions that don't need book ownership.
 */
export const authedAction = customAction(baseAction, {
  args: { _adminKey: v.optional(v.string()) },
  input: async (ctx, { _adminKey }) => {
    const identity = await requireIdentity(ctx, _adminKey);
    return {
      ctx: { principalId: principalId(identity), isAdmin: isAdmin(identity), _adminKey },
      args: {},
    };
  },
});

// ============================================================================
// Book action (require book write access)
// ============================================================================

/**
 * Book action - requires bookPath arg and validates write access.
 * Use for actions that modify book content (like chapter editing).
 *
 * @example
 * export const editChapter = bookAction({
 *   args: { chapterNumber: v.number() },
 *   handler: async (ctx, { chapterNumber }) => {
 *     // ctx.bookPath is available and access is verified
 *     console.log(`Editing chapter ${chapterNumber} of ${ctx.bookPath}`);
 *   },
 * });
 */
export const bookAction = customAction(baseAction, {
  args: { bookPath: v.string(), _adminKey: v.optional(v.string()) },
  input: async (ctx, { bookPath, _adminKey }) => {
    const { principalId, role } = await requireBookWriteAccessFromAction(ctx, bookPath, _adminKey);
    return {
      ctx: { principalId, role, bookPath },
      args: {}, // bookPath consumed by wrapper, not passed to handler
    };
  },
});

/**
 * Context available in bookAction handlers.
 */
export interface BookActionCtx {
  /** User's stable identifier (tokenIdentifier) */
  principalId: string;
  /** User's role for this book */
  role: BookRole;
  /** The authorized book path */
  bookPath: string;
}
