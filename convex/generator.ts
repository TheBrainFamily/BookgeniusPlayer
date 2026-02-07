import { v } from "convex/values";
import { components } from "./_generated/api";
import { adminMutation, publicQuery } from "./functions";

const PIPELINE_STEPS = [
  "import_epub",
  "create_settings",
  "upload_figures",
  "generate_reference_cards",
  "rewrite_paragraphs",
  "generate_graphical_style",
  "generate_backgrounds",
  "generate_entity_pictures",
  "map_summaries_to_paragraphs",
] as const;

const stepStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("done"),
  v.literal("error"),
  v.literal("skipped"),
);

export const ensureBookStructure = adminMutation({
  args: {
    jobId: v.string(),
    bookSlug: v.string(),
    metadata: v.optional(
      v.object({
        title: v.optional(v.string()),
        author: v.optional(v.string()),
        language: v.optional(v.string()),
        form: v.optional(v.string()),
      }),
    ),
    totalChapters: v.optional(v.number()),
  },
  handler: async (ctx, { jobId, bookSlug, metadata, totalChapters }) => {
    const bookPath = `books/${bookSlug}`;
    const now = Date.now();

    const existingJob = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_bookPath", (q) => q.eq("bookPath", bookPath))
      .first();

    if (existingJob) {
      await ctx.db.patch(existingJob._id, {
        jobId,
        status: "generating",
        currentStep: "import_epub",
        steps: PIPELINE_STEPS.map((step) => ({ step, status: "pending" as const })),
        totalChapters,
        updatedAt: now,
        lastHeartbeatAt: now,
      });
    } else {
      await ctx.db.insert("bookGenerationJobs", {
        jobId,
        bookPath,
        bookSlug,
        status: "generating",
        currentStep: "import_epub",
        steps: PIPELINE_STEPS.map((step) => ({ step, status: "pending" as const })),
        totalChapters,
        readyChapters: 0,
        createdAt: now,
        updatedAt: now,
        lastHeartbeatAt: now,
      });
    }

    const createFolder = async (path: string) => {
      try {
        await ctx.runMutation(components.versionedAssets.assetManager.createFolderByPath, { path });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("already exists")) throw e;
      }
    };

    await createFolder("books");
    await createFolder(bookPath);
    await createFolder(`${bookPath}/chapters`);
    await createFolder(`${bookPath}/chapters-source`);
    await createFolder(`${bookPath}/characters`);
    await createFolder(`${bookPath}/characters-data`);
    await createFolder(`${bookPath}/backgrounds`);
    await createFolder(`${bookPath}/music`);
    await createFolder(`${bookPath}/figures`);

    const existingBook = await ctx.db
      .query("books")
      .withIndex("by_path", (q) => q.eq("path", bookPath))
      .first();

    if (existingBook) {
      await ctx.db.patch(existingBook._id, {
        title: metadata?.title ?? existingBook.title,
        author: metadata?.author ?? existingBook.author,
        language: metadata?.language ?? existingBook.language,
        form: metadata?.form ?? existingBook.form,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("books", {
        path: bookPath,
        slug: bookSlug,
        ownerId: ctx.principalId,
        title: metadata?.title,
        author: metadata?.author,
        language: metadata?.language,
        form: metadata?.form,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { bookPath };
  },
});

export const reportProgress = adminMutation({
  args: {
    bookPath: v.string(),
    step: v.string(),
    status: stepStatusValidator,
    message: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { bookPath, step, status, message, error }) => {
    const job = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_bookPath", (q) => q.eq("bookPath", bookPath))
      .first();

    if (!job) {
      throw new Error(`No generation job found for ${bookPath}`);
    }

    const now = Date.now();
    const updatedSteps = job.steps.map((s) => {
      if (s.step !== step) return s;
      return {
        ...s,
        status,
        startedAt: status === "running" ? now : s.startedAt,
        endedAt: status === "done" || status === "error" ? now : s.endedAt,
        message,
      };
    });

    let jobStatus = job.status;
    if (status === "error") {
      jobStatus = "failed";
    } else if (step === "map_summaries_to_paragraphs" && status === "done") {
      jobStatus = "completed";
    }

    await ctx.db.patch(job._id, {
      currentStep: status === "running" ? step : job.currentStep,
      steps: updatedSteps,
      status: jobStatus,
      error: status === "error" ? error : job.error,
      updatedAt: now,
      lastHeartbeatAt: now,
    });
  },
});

export const heartbeat = adminMutation({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const job = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_bookPath", (q) => q.eq("bookPath", bookPath))
      .first();

    if (job) {
      await ctx.db.patch(job._id, { lastHeartbeatAt: Date.now() });
    }
  },
});

export const updateBookMetadata = adminMutation({
  args: {
    bookPath: v.string(),
    metadata: v.object({
      title: v.optional(v.string()),
      author: v.optional(v.string()),
      language: v.optional(v.string()),
      form: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { bookPath, metadata }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("books")
      .withIndex("by_path", (q) => q.eq("path", bookPath))
      .first();

    if (!existing) {
      const slug = bookPath.split("/").pop() || bookPath;
      await ctx.db.insert("books", {
        path: bookPath,
        slug,
        ownerId: ctx.principalId,
        title: metadata.title,
        author: metadata.author,
        language: metadata.language,
        form: metadata.form,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.patch(existing._id, {
      title: metadata.title ?? existing.title,
      author: metadata.author ?? existing.author,
      language: metadata.language ?? existing.language,
      form: metadata.form ?? existing.form,
      updatedAt: now,
    });
  },
});

export const updateGraphicalStyle = adminMutation({
  args: {
    bookPath: v.string(),
    backgroundStyle: v.optional(v.string()),
    periodStyle: v.optional(v.string()),
    avatarStyle: v.optional(v.string()),
  },
  handler: async (ctx, { bookPath, ...styles }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("books")
      .withIndex("by_path", (q) => q.eq("path", bookPath))
      .first();

    if (!existing) {
      const slug = bookPath.split("/").pop() || bookPath;
      await ctx.db.insert("books", {
        path: bookPath,
        slug,
        ownerId: ctx.principalId,
        backgroundStyle: styles.backgroundStyle,
        periodStyle: styles.periodStyle,
        avatarStyle: styles.avatarStyle,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.patch(existing._id, {
      backgroundStyle: styles.backgroundStyle ?? existing.backgroundStyle,
      periodStyle: styles.periodStyle ?? existing.periodStyle,
      avatarStyle: styles.avatarStyle ?? existing.avatarStyle,
      updatedAt: now,
    });
  },
});

export const ensureCharacterFolder = adminMutation({
  args: {
    bookPath: v.string(),
    characterSlug: v.string(),
    displayName: v.string(),
    summary: v.optional(v.string()),
    aiPrompt: v.optional(v.string()),
  },
  handler: async (ctx, { bookPath, characterSlug, displayName, summary, aiPrompt }) => {
    const characterPath = `${bookPath}/characters/${characterSlug}`;

    try {
      await ctx.runMutation(components.versionedAssets.assetManager.createFolderByPath, {
        path: characterPath,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already exists")) throw e;
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("characterMetadata")
      .withIndex("by_book_slug", (q) => q.eq("bookPath", bookPath).eq("slug", characterSlug))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: displayName ?? existing.displayName,
        summary: summary ?? existing.summary,
        aiPrompt: aiPrompt ?? existing.aiPrompt,
        avatarGenerationState: existing.avatarGenerationState ?? "none",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("characterMetadata", {
        bookPath,
        characterPath,
        slug: characterSlug,
        displayName,
        summary: summary || "",
        aiPrompt,
        avatarGenerationState: "none",
        createdAt: now,
        updatedAt: now,
      });
    }

    return { characterPath };
  },
});

export const markCharacterAvatarState = adminMutation({
  args: {
    characterPath: v.string(),
    state: v.union(
      v.literal("generating"),
      v.literal("ready"),
      v.literal("error"),
      v.literal("none"),
    ),
  },
  handler: async (ctx, { characterPath, state }) => {
    const now = Date.now();
    const slug = characterPath.split("/").pop() || characterPath;
    const bookPath = characterPath.split("/").slice(0, 2).join("/");

    const existing = await ctx.db
      .query("characterMetadata")
      .withIndex("by_path", (q) => q.eq("characterPath", characterPath))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { avatarGenerationState: state, updatedAt: now });
      return;
    }

    await ctx.db.insert("characterMetadata", {
      bookPath,
      characterPath,
      slug,
      displayName: slug,
      summary: "",
      avatarGenerationState: state,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertBackgroundCue = adminMutation({
  args: {
    bookPath: v.string(),
    chapter: v.number(),
    paragraph: v.number(),
    fileBasename: v.string(),
    backgroundColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { bookPath, chapter, paragraph, fileBasename, backgroundColor, textColor },
  ) => {
    const existing = await ctx.db
      .query("backgroundCues")
      .withIndex("by_book_position", (q) =>
        q.eq("bookPath", bookPath).eq("chapter", chapter).eq("paragraph", paragraph),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { fileBasename, backgroundColor, textColor });
    } else {
      await ctx.db.insert("backgroundCues", {
        bookPath,
        chapter,
        paragraph,
        fileBasename,
        backgroundColor,
        textColor,
      });
    }
  },
});

export const upsertMusicCue = adminMutation({
  args: {
    bookPath: v.string(),
    chapter: v.number(),
    paragraph: v.number(),
    fileBasename: v.string(),
    order: v.optional(v.number()),
  },
  handler: async (ctx, { bookPath, chapter, paragraph, fileBasename, order }) => {
    const existing = await ctx.db
      .query("musicCues")
      .withIndex("by_book_position", (q) =>
        q.eq("bookPath", bookPath).eq("chapter", chapter).eq("paragraph", paragraph),
      )
      .first();

    if (existing && existing.fileBasename === fileBasename) {
      await ctx.db.patch(existing._id, { order });
    } else {
      await ctx.db.insert("musicCues", { bookPath, chapter, paragraph, fileBasename, order });
    }
  },
});

export const incrementReadyChapters = adminMutation({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const job = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_bookPath", (q) => q.eq("bookPath", bookPath))
      .first();

    if (job) {
      await ctx.db.patch(job._id, {
        readyChapters: (job.readyChapters || 0) + 1,
        updatedAt: Date.now(),
      });
    }
  },
});

export const markCompleted = adminMutation({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const job = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_bookPath", (q) => q.eq("bookPath", bookPath))
      .first();

    if (!job) return;

    await ctx.db.patch(job._id, { status: "completed", updatedAt: Date.now() });
  },
});

export const markFailed = adminMutation({
  args: { bookPath: v.string(), error: v.string() },
  handler: async (ctx, { bookPath, error }) => {
    const job = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_bookPath", (q) => q.eq("bookPath", bookPath))
      .first();

    if (!job) return;

    await ctx.db.patch(job._id, { status: "failed", error, updatedAt: Date.now() });
  },
});

export const getGenerationStatus = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const job = await ctx.db
      .query("bookGenerationJobs")
      .withIndex("by_bookPath", (q) => q.eq("bookPath", bookPath))
      .first();

    if (!job) return null;

    return {
      jobId: job.jobId,
      status: job.status,
      currentStep: job.currentStep,
      steps: job.steps,
      totalChapters: job.totalChapters,
      readyChapters: job.readyChapters,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  },
});
