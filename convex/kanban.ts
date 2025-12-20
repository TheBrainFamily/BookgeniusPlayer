import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { slugify } from "./components/asset-manager/slugify";
import { requireAuth } from "./authHelpers";

const KANBAN_COLUMNS = ["backlog", "doing", "review", "done"] as const;
type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

export const createBoard = mutation({
  args: { boardSlug: v.string() },
  returns: v.object({
    boardSlug: v.string(),
    columns: v.array(
      v.object({
        slug: v.string(),
        path: v.string(),
      }),
    ),
  }),
  handler: async (ctx, { boardSlug }) => {
    await requireAuth(ctx);
    // For now, assume boardSlug is already a slug.
    const basePath = `kanban/${boardSlug}`;

    // create root + columns using your folder API
    await ctx.runMutation(
      components.assetManager.assetManager.createFolderByPath,
      { path: basePath },
    );

    const columns = [];
    for (const col of KANBAN_COLUMNS) {
      const columnPath = `${basePath}/${col}`;
      await ctx.runMutation(
        components.assetManager.assetManager.createFolderByPath,
        {
          path: columnPath,
        },
      );
      columns.push({ slug: col, path: columnPath });
    }

    return { boardSlug, columns };
  },
});

export const listColumns = query({
  args: { boardSlug: v.string() },
  returns: v.array(
    v.object({
      slug: v.string(),
      path: v.string(),
    }),
  ),
  handler: async (ctx, { boardSlug }) => {
    const basePath = `kanban/${boardSlug}`;

    const children = await ctx.runQuery(
      components.assetManager.assetManager.listFolders,
      {
        parentPath: basePath,
      },
    );

    // Only keep known Kanban columns, and map to slug/path
    const bySlug: Record<string, string> = {};
    for (const col of KANBAN_COLUMNS) {
      const p = `${basePath}/${col}`;
      bySlug[col] = p;
    }

    return KANBAN_COLUMNS.map((slug) => ({
      slug,
      path: bySlug[slug],
    })).filter((col) => children.some((f) => f.path === col.path));
  },
});

export const createCard = mutation({
  args: {
    boardSlug: v.string(),
    column: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
  },
  returns: v.object({
    boardSlug: v.string(),
    column: v.string(),
    basename: v.string(),
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (!KANBAN_COLUMNS.includes(args.column as KanbanColumn)) {
      throw new Error("Unknown column");
    }

    const folderPath = `kanban/${args.boardSlug}/${args.column}`;
    const basename = slugify(args.title);

    const { version } = await ctx.runMutation(
      components.assetManager.assetManager.commitVersion,
      {
        folderPath,
        basename,
        publish: true,
        label: args.title,
        extra: {
          title: args.title,
          description: args.description ?? "",
        },
      },
    );

    return {
      boardSlug: args.boardSlug,
      column: args.column,
      basename,
      version,
    };
  },
});

export const listColumnCards = query({
  args: {
    boardSlug: v.string(),
    column: v.string(),
  },
  returns: v.array(
    v.object({
      boardSlug: v.string(),
      column: v.string(),
      basename: v.string(),
      title: v.string(),
      description: v.string(),
      version: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!KANBAN_COLUMNS.includes(args.column as KanbanColumn)) {
      return [];
    }

    const folderPath = `kanban/${args.boardSlug}/${args.column}`;

    const assets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath },
    );

    return assets.map((asset) => {
      const extra = (asset.extra ?? {}) as {
        title?: string;
        description?: string;
      };

      return {
        boardSlug: args.boardSlug,
        column: args.column,
        basename: asset.basename,
        title: extra.title ?? asset.label ?? asset.basename,
        description: extra.description ?? "",
        version: asset.version,
      };
    });
  },
});

export const updateCard = mutation({
  args: {
    boardSlug: v.string(),
    column: v.string(),
    basename: v.string(),
    title: v.string(),
    description: v.string(),
  },
  returns: v.object({
    boardSlug: v.string(),
    column: v.string(),
    basename: v.string(),
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (!KANBAN_COLUMNS.includes(args.column as KanbanColumn)) {
      throw new Error(`Invalid column: ${args.column}`);
    }

    const folderPath = `kanban/${args.boardSlug}/${args.column}`;

    // commitVersion with same basename creates a new version
    const { version } = await ctx.runMutation(
      components.assetManager.assetManager.commitVersion,
      {
        folderPath,
        basename: args.basename,
        publish: true,
        label: args.title,
        extra: {
          title: args.title,
          description: args.description,
        },
      },
    );

    return {
      boardSlug: args.boardSlug,
      column: args.column,
      basename: args.basename,
      version,
    };
  },
});

export const moveCard = mutation({
  args: {
    boardSlug: v.string(),
    fromColumn: v.string(),
    toColumn: v.string(),
    basename: v.string(),
  },
  returns: v.object({
    boardSlug: v.string(),
    column: v.string(),
    basename: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (!KANBAN_COLUMNS.includes(args.fromColumn as KanbanColumn)) {
      throw new Error(`Invalid source column: ${args.fromColumn}`);
    }
    if (!KANBAN_COLUMNS.includes(args.toColumn as KanbanColumn)) {
      throw new Error(`Invalid destination column: ${args.toColumn}`);
    }

    const fromPath = `kanban/${args.boardSlug}/${args.fromColumn}`;
    const toPath = `kanban/${args.boardSlug}/${args.toColumn}`;

    await ctx.runMutation(components.assetManager.assetManager.moveAsset, {
      fromFolderPath: fromPath,
      basename: args.basename,
      toFolderPath: toPath,
    });

    return {
      boardSlug: args.boardSlug,
      column: args.toColumn,
      basename: args.basename,
    };
  },
});

export const getCard = query({
  args: {
    boardSlug: v.string(),
    column: v.string(),
    basename: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      boardSlug: v.string(),
      column: v.string(),
      basename: v.string(),
      title: v.string(),
      description: v.string(),
      version: v.number(),
      createdAt: v.number(),
      publishedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    if (!KANBAN_COLUMNS.includes(args.column as KanbanColumn)) {
      return null;
    }

    const folderPath = `kanban/${args.boardSlug}/${args.column}`;

    const assets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath }
    );

    const asset = assets.find((a) => a.basename === args.basename);
    if (!asset) return null;

    const extra = (asset.extra ?? {}) as {
      title?: string;
      description?: string;
    };

    return {
      boardSlug: args.boardSlug,
      column: args.column,
      basename: asset.basename,
      title: extra.title ?? asset.label ?? asset.basename,
      description: extra.description ?? "",
      version: asset.version,
      createdAt: asset.createdAt,
      publishedAt: asset.publishedAt,
    };
  },
});

export const getCardHistory = query({
  args: {
    boardSlug: v.string(),
    column: v.string(),
    basename: v.string(),
  },
  returns: v.array(
    v.object({
      type: v.string(),
      fromColumn: v.optional(v.string()),
      toColumn: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const folderPath = `kanban/${args.boardSlug}/${args.column}`;

    const events = await ctx.runQuery(
      components.assetManager.assetManager.listAssetEvents,
      { folderPath, basename: args.basename },
    );

    return events.map((e) => ({
      type: e.type,
      fromColumn: e.fromFolderPath?.split("/").pop(),
      toColumn: e.toFolderPath?.split("/").pop(),
      createdAt: e.createdAt,
    }));
  },
});
