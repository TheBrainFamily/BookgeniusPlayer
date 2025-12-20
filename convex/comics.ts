// convex/comics.ts
import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  MutationCtx,
} from "./_generated/server";
import { components } from "./_generated/api";
import { requireAuth } from "./authHelpers";

// Character metadata structure
const characterMetadataValidator = v.object({
  name: v.string(),
  organism: v.string(),
  power: v.string(),
  archetype: v.string(),
  bio: v.string(),
});

// Character image type for per-character selection in frames
const characterImageTypeValidator = v.union(
  v.literal("comic"),
  v.literal("superhero"),
  v.literal("both"),
);

// Frame structure for scenarios
const frameValidator = v.object({
  scene: v.string(),
  characters: v.array(v.string()),
  characterImageTypes: v.optional(
    v.record(v.string(), characterImageTypeValidator),
  ),
  speaker: v.string(),
  dialogue: v.string(),
  imageType: v.union(v.literal("comic"), v.literal("superhero")),
});

// Character image config in scenarios
const characterImagesValidator = v.record(
  v.string(),
  v.union(v.literal("comic"), v.literal("superhero"), v.literal("both")),
);

// Full scenario structure
const scenarioValidator = v.object({
  name: v.string(),
  description: v.string(),
  characterImages: characterImagesValidator,
  frames: v.array(frameValidator),
});

// ============== CHARACTER OPERATIONS ==============

// List all characters from /comics/characters/
export const listCharacters = query({
  args: {},
  handler: async (ctx) => {
    // List all folders under /comics/characters/
    const characterFolders = await ctx.runQuery(
      components.assetManager.assetManager.listFolders,
      { parentPath: "comics/characters" },
    );

    const characters = await Promise.all(
      characterFolders.map(async (folder) => {
        const characterKey = folder.name;

        // Get published assets including metadata
        const publishedAssets = await ctx.runQuery(
          components.assetManager.assetManager.listPublishedAssetsInFolder,
          { folderPath: folder.path },
        );

        // Get published files for URLs
        const publishedFiles = await ctx.runQuery(
          components.assetManager.assetManager.listPublishedFilesInFolder,
          { folderPath: folder.path },
        );

        // Find metadata from assets
        const metadataAsset = publishedAssets.find(
          (a) => a.basename === "metadata.json",
        );

        // Find images from files
        const comicImage = publishedFiles.find(
          (f) => f.basename === "comic.png" || f.basename === "comic.jpg",
        );
        const superheroImage = publishedFiles.find(
          (f) =>
            f.basename === "superhero.png" || f.basename === "superhero.jpg",
        );

        return {
          key: characterKey,
          folderPath: folder.path,
          metadata: (metadataAsset?.extra as CharacterMetadata) ?? null,
          // Return versionId and basename for CDN-aware URL building
          comicImage: comicImage
            ? { versionId: comicImage.versionId, basename: comicImage.basename }
            : null,
          superheroImage: superheroImage
            ? {
                versionId: superheroImage.versionId,
                basename: superheroImage.basename,
              }
            : null,
          // Keep raw URLs for server-side use (e.g., image generation)
          comicImageUrl: comicImage?.url ?? null,
          superheroImageUrl: superheroImage?.url ?? null,
        };
      }),
    );

    return characters;
  },
});

// Type for character metadata
type CharacterMetadata = {
  name: string;
  organism: string;
  power: string;
  archetype: string;
  bio: string;
};

// Get a single character with full details
export const getCharacter = query({
  args: {
    characterKey: v.string(),
  },
  handler: async (ctx, args) => {
    const folderPath = `comics/characters/${args.characterKey}`;

    // Check if folder exists
    const folder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: folderPath },
    );

    if (!folder) {
      return null;
    }

    // Get all assets in the character folder
    const assets = await ctx.runQuery(
      components.assetManager.assetManager.listAssets,
      { folderPath },
    );

    // Get published assets (includes extra/metadata)
    const publishedAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath },
    );

    // Get published files (includes URLs)
    const publishedFiles = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath },
    );

    // Find metadata from assets
    const metadataAsset = publishedAssets.find(
      (a) => a.basename === "metadata.json",
    );

    // Find images from files
    const comicFile = publishedFiles.find(
      (f) => f.basename === "comic.png" || f.basename === "comic.jpg",
    );
    const superheroFile = publishedFiles.find(
      (f) => f.basename === "superhero.png" || f.basename === "superhero.jpg",
    );

    return {
      key: args.characterKey,
      folderPath,
      metadata: (metadataAsset?.extra as CharacterMetadata) ?? null,
      comicImageUrl: comicFile?.url ?? null,
      superheroImageUrl: superheroFile?.url ?? null,
      assets,
      publishedFiles,
    };
  },
});

// Update character metadata
export const updateCharacterMetadata = mutation({
  args: {
    characterKey: v.string(),
    metadata: characterMetadataValidator,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const folderPath = `comics/characters/${args.characterKey}`;

    // Check if character folder exists, create if not
    const folder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: folderPath },
    );

    if (!folder) {
      // Create the character folder structure
      await ctx.runMutation(
        components.assetManager.assetManager.createFolderByPath,
        { path: folderPath },
      );
    }

    // Create or update metadata using commitVersion
    await ctx.runMutation(components.assetManager.assetManager.commitVersion, {
      folderPath,
      basename: "metadata.json",
      publish: true,
      extra: args.metadata,
    });

    return { success: true };
  },
});

// ============== SCENARIO OPERATIONS ==============

// List all scenarios from /comics/scenarios/
export const listScenarios = query({
  args: {},
  handler: async (ctx) => {
    // Get published assets which include extra/metadata
    const publishedAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: "comics/scenarios" },
    );

    return publishedAssets
      .filter((a) => a.basename.endsWith(".json"))
      .map((a) => ({
        name: a.basename.replace(".json", ""),
        basename: a.basename,
        scenario: a.extra as ScenarioData | null,
      }));
  },
});

// Type for scenario data
type ScenarioData = {
  name: string;
  description: string;
  characterImages: Record<string, "comic" | "superhero" | "both">;
  frames: Array<{
    scene: string;
    characters: string[];
    speaker: string;
    dialogue: string;
    imageType: "comic" | "superhero";
  }>;
};

// Get a single scenario
export const getScenario = query({
  args: {
    scenarioName: v.string(),
  },
  handler: async (ctx, args) => {
    const basename = args.scenarioName.endsWith(".json")
      ? args.scenarioName
      : `${args.scenarioName}.json`;

    // Get published assets to access the extra/scenario data
    const publishedAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: "comics/scenarios" },
    );

    const scenarioAsset = publishedAssets.find((a) => a.basename === basename);

    if (!scenarioAsset) {
      return null;
    }

    return {
      name: args.scenarioName.replace(".json", ""),
      basename,
      scenario: scenarioAsset.extra as ScenarioData | null,
    };
  },
});

// Create a new scenario
export const createScenario = mutation({
  args: {
    name: v.string(),
    scenario: scenarioValidator,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const folderPath = "comics/scenarios";
    const basename = `${args.name}.json`;

    // Ensure the scenarios folder exists
    const folder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: folderPath },
    );

    if (!folder) {
      await ctx.runMutation(
        components.assetManager.assetManager.createFolderByPath,
        { path: folderPath },
      );
    }

    // Check if scenario already exists
    const existing = await ctx.runQuery(
      components.assetManager.assetManager.getAsset,
      { folderPath, basename },
    );

    if (existing) {
      throw new Error(`Scenario "${args.name}" already exists`);
    }

    // Create and publish the scenario using commitVersion
    await ctx.runMutation(components.assetManager.assetManager.commitVersion, {
      folderPath,
      basename,
      publish: true,
      extra: args.scenario,
    });

    return { success: true, name: args.name };
  },
});

// Update an existing scenario
export const updateScenario = mutation({
  args: {
    scenarioName: v.string(),
    scenario: scenarioValidator,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const folderPath = "comics/scenarios";
    const basename = args.scenarioName.endsWith(".json")
      ? args.scenarioName
      : `${args.scenarioName}.json`;

    // Check if scenario exists
    const existing = await ctx.runQuery(
      components.assetManager.assetManager.getAsset,
      { folderPath, basename },
    );

    if (!existing) {
      throw new Error(`Scenario "${args.scenarioName}" not found`);
    }

    // Update by creating new version using commitVersion
    await ctx.runMutation(components.assetManager.assetManager.commitVersion, {
      folderPath,
      basename,
      publish: true,
      extra: args.scenario,
    });

    return { success: true };
  },
});

// ============== GALLERY OPERATIONS ==============

// List generated comic strips from /comics/strips/
export const listGeneratedStrips = query({
  args: {
    scenarioName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const folderPath = args.scenarioName
      ? `comics/strips/${args.scenarioName}`
      : "comics/strips";

    // First check if the folder exists
    const folder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: folderPath },
    );

    if (!folder) {
      return [];
    }

    // If looking at a specific scenario, get the strips
    if (args.scenarioName) {
      const publishedFiles = await ctx.runQuery(
        components.assetManager.assetManager.listPublishedFilesInFolder,
        { folderPath },
      );

      return (
        publishedFiles
          .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.basename))
          // Sort by publishedAt descending so most recently published is first
          .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
          .map((f) => ({
            scenarioName: args.scenarioName!,
            basename: f.basename,
            versionId: f.versionId,
            url: f.url,
            version: f.version,
            publishedAt: f.publishedAt,
          }))
      );
    }

    // Otherwise list all scenario folders - get most recently published strip per scenario
    const scenarioFolders = await ctx.runQuery(
      components.assetManager.assetManager.listFolders,
      { parentPath: folderPath },
    );

    const allStrips = await Promise.all(
      scenarioFolders.map(async (folder) => {
        const publishedFiles = await ctx.runQuery(
          components.assetManager.assetManager.listPublishedFilesInFolder,
          { folderPath: folder.path },
        );

        const imageFiles = publishedFiles
          .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.basename))
          // Sort by publishedAt descending so most recently published is first
          .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

        // Return only the most recently published strip per scenario
        const newest = imageFiles[0];
        if (!newest) return null;

        return {
          scenarioName: folder.name,
          basename: newest.basename,
          versionId: newest.versionId,
          url: newest.url,
          version: newest.version,
          publishedAt: newest.publishedAt,
        };
      }),
    );

    return allStrips.filter((s): s is NonNullable<typeof s> => s !== null);
  },
});

// Get all versions of a generated strip for a scenario
export const getStripVersions = query({
  args: {
    scenarioName: v.string(),
    basename: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const folderPath = `comics/strips/${args.scenarioName}`;
    const stripBasename = args.basename ?? `${args.scenarioName}.png`;

    const versions = await ctx.runQuery(
      components.assetManager.assetManager.getAssetVersions,
      { folderPath, basename: stripBasename },
    );

    return versions;
  },
});

// ============== SCENARIO ORDER ==============

// Get the ordered list of scenario names
export const getScenarioOrder = query({
  args: {},
  handler: async (ctx) => {
    const publishedAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: "comics/config" },
    );

    const orderAsset = publishedAssets.find(
      (a) => a.basename === "scenario-order.json",
    );

    if (!orderAsset?.extra) {
      return null;
    }

    return orderAsset.extra as { order: string[] };
  },
});

// Save the scenario order
export const saveScenarioOrder = mutation({
  args: {
    order: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const folderPath = "comics/config";

    // Ensure config folder exists
    const folder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: folderPath },
    );

    if (!folder) {
      await ctx.runMutation(
        components.assetManager.assetManager.createFolderByPath,
        { path: folderPath },
      );
    }

    // Save the order using commitVersion
    await ctx.runMutation(components.assetManager.assetManager.commitVersion, {
      folderPath,
      basename: "scenario-order.json",
      publish: true,
      extra: { order: args.order },
    });

    return { success: true };
  },
});

// ============== STRIP FOLDER MANAGEMENT ==============

// Ensure strip folder exists and return the correct basename for the scenario
export const ensureStripFolder = mutation({
  args: {
    scenarioName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const folderPath = `comics/strips/${args.scenarioName}`;

    // Check if folder exists
    const folder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: folderPath },
    );

    // Create folder if it doesn't exist
    if (!folder) {
      await ctx.runMutation(
        components.assetManager.assetManager.createFolderByPath,
        { path: folderPath },
      );
    }

    // Check for existing strip assets to get the correct basename
    const existingAssets = await ctx.runQuery(
      components.assetManager.assetManager.listAssets,
      { folderPath },
    );

    // Find any existing image asset
    const existingImage = existingAssets.find((a) =>
      /\.(png|jpg|jpeg|webp)$/i.test(a.basename),
    );

    // Return existing basename or default to .png
    const basename = existingImage?.basename ?? `${args.scenarioName}.png`;

    return { folderPath, basename };
  },
});

// ============== STORY OPERATIONS ==============

type StoryMetadata = {
  slug: string;
  name: string;
  description: string;
  createdAt?: number;
  updatedAt?: number;
};

// List all stories
export const listStories = query({
  args: {},
  handler: async (ctx) => {
    // List all folders under /comics/stories/
    const storyFolders = await ctx.runQuery(
      components.assetManager.assetManager.listFolders,
      { parentPath: "comics/stories" },
    );

    const stories = await Promise.all(
      storyFolders.map(async (folder) => {
        // Get metadata
        const publishedAssets = await ctx.runQuery(
          components.assetManager.assetManager.listPublishedAssetsInFolder,
          { folderPath: folder.path },
        );

        const metadataAsset = publishedAssets.find(
          (a) => a.basename === "metadata.json",
        );

        // Get scenario count
        const scenariosPath = `${folder.path}/scenarios`;
        const scenarioAssets = await ctx.runQuery(
          components.assetManager.assetManager.listPublishedAssetsInFolder,
          { folderPath: scenariosPath },
        );
        const scenarioCount = scenarioAssets.filter((a) =>
          a.basename.endsWith(".json"),
        ).length;

        // Get the newest strip from the first scenario as thumbnail
        const stripsPath = `${folder.path}/strips`;
        const stripFolders = await ctx.runQuery(
          components.assetManager.assetManager.listFolders,
          { parentPath: stripsPath },
        );

        let thumbnailVersionId: string | null = null;
        let thumbnailBasename: string | null = null;
        let thumbnailUrl: string | null = null;

        // Get first scenario folder and find newest strip in it
        if (stripFolders.length > 0) {
          const firstStripFolder = stripFolders[0];
          const stripFiles = await ctx.runQuery(
            components.assetManager.assetManager.listPublishedFilesInFolder,
            { folderPath: firstStripFolder.path },
          );
          const imageFiles = stripFiles
            .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.basename))
            .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

          if (imageFiles.length > 0) {
            const newest = imageFiles[0];
            thumbnailVersionId = newest.versionId;
            thumbnailBasename = newest.basename;
            thumbnailUrl = newest.url;
          }
        }

        const metadata = metadataAsset?.extra as StoryMetadata | undefined;

        return {
          slug: folder.name,
          name: metadata?.name ?? folder.name,
          description: metadata?.description ?? "",
          scenarioCount,
          thumbnailVersionId,
          thumbnailBasename,
          thumbnailUrl,
          createdAt: metadata?.createdAt,
          updatedAt: metadata?.updatedAt,
        };
      }),
    );

    return stories;
  },
});

// Get a single story
export const getStory = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const folderPath = `comics/stories/${args.slug}`;

    // Check if folder exists
    const folder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: folderPath },
    );

    if (!folder) {
      return null;
    }

    // Get metadata
    const publishedAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath },
    );

    const metadataAsset = publishedAssets.find(
      (a) => a.basename === "metadata.json",
    );

    const metadata = metadataAsset?.extra as StoryMetadata | undefined;

    return {
      slug: args.slug,
      name: metadata?.name ?? args.slug,
      description: metadata?.description ?? "",
      createdAt: metadata?.createdAt,
      updatedAt: metadata?.updatedAt,
    };
  },
});

// Core story creation logic (shared by public and internal mutations)
async function createStoryCore(
  ctx: MutationCtx,
  args: { slug: string; name: string; description: string },
) {
  const folderPath = `comics/stories/${args.slug}`;

  // Check if story already exists
  const existing = await ctx.runQuery(
    components.assetManager.assetManager.getFolder,
    { path: folderPath },
  );

  if (existing) {
    throw new Error(`Story "${args.slug}" already exists`);
  }

  const now = Date.now();

  // Create story folder
  await ctx.runMutation(
    components.assetManager.assetManager.createFolderByPath,
    { path: folderPath },
  );

  // Create scenarios subfolder
  await ctx.runMutation(
    components.assetManager.assetManager.createFolderByPath,
    { path: `${folderPath}/scenarios` },
  );

  // Create strips subfolder
  await ctx.runMutation(
    components.assetManager.assetManager.createFolderByPath,
    { path: `${folderPath}/strips` },
  );

  // Save metadata
  await ctx.runMutation(components.assetManager.assetManager.commitVersion, {
    folderPath,
    basename: "metadata.json",
    publish: true,
    extra: {
      slug: args.slug,
      name: args.name,
      description: args.description,
      createdAt: now,
      updatedAt: now,
    },
  });

  return { success: true, slug: args.slug };
}

// Create a new story (public, requires auth)
export const createStory = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return createStoryCore(ctx, args);
  },
});

// Create a new story (internal, no auth - for scheduled actions)
export const createStoryInternal = internalMutation({
  args: {
    slug: v.string(),
    name: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    return createStoryCore(ctx, args);
  },
});

// Update a story
export const updateStory = mutation({
  args: {
    slug: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const folderPath = `comics/stories/${args.slug}`;

    // Check if story exists
    const folder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: folderPath },
    );

    if (!folder) {
      throw new Error(`Story "${args.slug}" not found`);
    }

    // Get current metadata
    const publishedAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath },
    );

    const metadataAsset = publishedAssets.find(
      (a) => a.basename === "metadata.json",
    );

    const currentMetadata = (metadataAsset?.extra as StoryMetadata) ?? {
      slug: args.slug,
      name: args.slug,
      description: "",
    };

    const now = Date.now();

    // Update metadata
    await ctx.runMutation(components.assetManager.assetManager.commitVersion, {
      folderPath,
      basename: "metadata.json",
      publish: true,
      extra: {
        slug: args.slug,
        name: args.name ?? currentMetadata.name,
        description: args.description ?? currentMetadata.description,
        createdAt: currentMetadata.createdAt ?? now,
        updatedAt: now,
      },
    });

    return { success: true };
  },
});

// ============== STORY-SCOPED SCENARIO OPERATIONS ==============

// List scenarios for a story
export const listStoryScenarios = query({
  args: {
    storySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const folderPath = `comics/stories/${args.storySlug}/scenarios`;

    // Get published assets which include extra/metadata
    const publishedAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath },
    );

    return publishedAssets
      .filter((a) => a.basename.endsWith(".json"))
      .map((a) => ({
        name: a.basename.replace(".json", ""),
        basename: a.basename,
        scenario: a.extra as ScenarioData | null,
      }));
  },
});

// Get a single scenario from a story
export const getStoryScenario = query({
  args: {
    storySlug: v.string(),
    scenarioName: v.string(),
  },
  handler: async (ctx, args) => {
    const folderPath = `comics/stories/${args.storySlug}/scenarios`;
    const basename = args.scenarioName.endsWith(".json")
      ? args.scenarioName
      : `${args.scenarioName}.json`;

    const publishedAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath },
    );

    const scenarioAsset = publishedAssets.find((a) => a.basename === basename);

    if (!scenarioAsset) {
      return null;
    }

    return {
      name: args.scenarioName.replace(".json", ""),
      basename,
      scenario: scenarioAsset.extra as ScenarioData | null,
    };
  },
});

// Core scenario creation logic (shared by public and internal mutations)
async function createStoryScenarioCore(
  ctx: MutationCtx,
  args: { storySlug: string; name: string; scenario: ScenarioData },
) {
  const folderPath = `comics/stories/${args.storySlug}/scenarios`;
  const basename = `${args.name}.json`;

  // Ensure the scenarios folder exists
  const folder = await ctx.runQuery(
    components.assetManager.assetManager.getFolder,
    { path: folderPath },
  );

  if (!folder) {
    await ctx.runMutation(
      components.assetManager.assetManager.createFolderByPath,
      { path: folderPath },
    );
  }

  // Check if scenario already exists
  const existing = await ctx.runQuery(
    components.assetManager.assetManager.getAsset,
    { folderPath, basename },
  );

  if (existing) {
    throw new Error(`Scenario "${args.name}" already exists in this story`);
  }

  // Create and publish the scenario
  await ctx.runMutation(components.assetManager.assetManager.commitVersion, {
    folderPath,
    basename,
    publish: true,
    extra: args.scenario,
  });

  return { success: true, name: args.name };
}

// Create a scenario in a story (public, requires auth)
export const createStoryScenario = mutation({
  args: {
    storySlug: v.string(),
    name: v.string(),
    scenario: scenarioValidator,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return createStoryScenarioCore(
      ctx,
      args as { storySlug: string; name: string; scenario: ScenarioData },
    );
  },
});

// Create a scenario in a story (internal, no auth - for scheduled actions)
export const createStoryScenarioInternal = internalMutation({
  args: {
    storySlug: v.string(),
    name: v.string(),
    scenario: scenarioValidator,
  },
  handler: async (ctx, args) => {
    return createStoryScenarioCore(
      ctx,
      args as { storySlug: string; name: string; scenario: ScenarioData },
    );
  },
});

// Update a scenario in a story
export const updateStoryScenario = mutation({
  args: {
    storySlug: v.string(),
    scenarioName: v.string(),
    scenario: scenarioValidator,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const folderPath = `comics/stories/${args.storySlug}/scenarios`;
    const basename = args.scenarioName.endsWith(".json")
      ? args.scenarioName
      : `${args.scenarioName}.json`;

    // Check if scenario exists
    const existing = await ctx.runQuery(
      components.assetManager.assetManager.getAsset,
      { folderPath, basename },
    );

    if (!existing) {
      throw new Error(
        `Scenario "${args.scenarioName}" not found in this story`,
      );
    }

    // Update by creating new version
    await ctx.runMutation(components.assetManager.assetManager.commitVersion, {
      folderPath,
      basename,
      publish: true,
      extra: args.scenario,
    });

    return { success: true };
  },
});

// ============== STORY-SCOPED STRIP OPERATIONS ==============

// List generated strips for a story
export const listStoryStrips = query({
  args: {
    storySlug: v.string(),
    scenarioName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const basePath = `comics/stories/${args.storySlug}/strips`;
    const folderPath = args.scenarioName
      ? `${basePath}/${args.scenarioName}`
      : basePath;

    // Check if folder exists
    const folder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: folderPath },
    );

    if (!folder) {
      return [];
    }

    // If looking at a specific scenario, get the strips
    if (args.scenarioName) {
      const publishedFiles = await ctx.runQuery(
        components.assetManager.assetManager.listPublishedFilesInFolder,
        { folderPath },
      );

      return (
        publishedFiles
          .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.basename))
          // Sort by publishedAt descending so most recently published is first
          .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
          .map((f) => ({
            scenarioName: args.scenarioName!,
            basename: f.basename,
            versionId: f.versionId,
            url: f.url,
            version: f.version,
            publishedAt: f.publishedAt,
          }))
      );
    }

    // Otherwise list all scenario folders - get most recently published strip per scenario
    const scenarioFolders = await ctx.runQuery(
      components.assetManager.assetManager.listFolders,
      { parentPath: folderPath },
    );

    const allStrips = await Promise.all(
      scenarioFolders.map(async (folder) => {
        const publishedFiles = await ctx.runQuery(
          components.assetManager.assetManager.listPublishedFilesInFolder,
          { folderPath: folder.path },
        );

        const imageFiles = publishedFiles
          .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f.basename))
          // Sort by publishedAt descending so most recently published is first
          .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

        // Return only the most recently published strip per scenario
        const newest = imageFiles[0];
        if (!newest) return null;

        return {
          scenarioName: folder.name,
          basename: newest.basename,
          versionId: newest.versionId,
          url: newest.url,
          version: newest.version,
          publishedAt: newest.publishedAt,
        };
      }),
    );

    return allStrips.filter((s): s is NonNullable<typeof s> => s !== null);
  },
});

// ============== STORY-SCOPED ORDERING ==============

// Get scenario order for a story
export const getStoryScenarioOrder = query({
  args: {
    storySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const folderPath = `comics/stories/${args.storySlug}`;

    const publishedAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath },
    );

    const orderAsset = publishedAssets.find(
      (a) => a.basename === "scenario-order.json",
    );

    if (!orderAsset?.extra) {
      return null;
    }

    return orderAsset.extra as { order: string[] };
  },
});

// Core function for saving scenario order
async function saveStoryScenarioOrderCore(
  ctx: MutationCtx,
  args: { storySlug: string; order: string[] },
) {
  const folderPath = `comics/stories/${args.storySlug}`;

  // Ensure story folder exists
  const folder = await ctx.runQuery(
    components.assetManager.assetManager.getFolder,
    { path: folderPath },
  );

  if (!folder) {
    throw new Error(`Story "${args.storySlug}" not found`);
  }

  // Save the order
  await ctx.runMutation(components.assetManager.assetManager.commitVersion, {
    folderPath,
    basename: "scenario-order.json",
    publish: true,
    extra: { order: args.order },
  });

  return { success: true };
}

// Save scenario order for a story
export const saveStoryScenarioOrder = mutation({
  args: {
    storySlug: v.string(),
    order: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return saveStoryScenarioOrderCore(ctx, args);
  },
});

// Internal version for scheduled actions
export const saveStoryScenarioOrderInternal = internalMutation({
  args: {
    storySlug: v.string(),
    order: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return saveStoryScenarioOrderCore(ctx, args);
  },
});

// Core function for ensuring strip folder exists
async function ensureStoryStripFolderCore(
  ctx: MutationCtx,
  args: { storySlug: string; scenarioName: string },
) {
  const folderPath = `comics/stories/${args.storySlug}/strips/${args.scenarioName}`;

  // Check if folder exists
  const folder = await ctx.runQuery(
    components.assetManager.assetManager.getFolder,
    { path: folderPath },
  );

  // Create folder if it doesn't exist
  if (!folder) {
    await ctx.runMutation(
      components.assetManager.assetManager.createFolderByPath,
      { path: folderPath },
    );
  }

  // Check for existing strip assets
  const existingAssets = await ctx.runQuery(
    components.assetManager.assetManager.listAssets,
    { folderPath },
  );

  const existingImage = existingAssets.find((a) =>
    /\.(png|jpg|jpeg|webp)$/i.test(a.basename),
  );

  const basename = existingImage?.basename ?? `${args.scenarioName}.png`;

  return { folderPath, basename };
}

// Ensure strip folder exists for a story scenario (public, requires auth)
export const ensureStoryStripFolder = mutation({
  args: {
    storySlug: v.string(),
    scenarioName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return ensureStoryStripFolderCore(ctx, args);
  },
});

// Internal version for scheduled actions (no auth required)
export const ensureStoryStripFolderInternal = internalMutation({
  args: {
    storySlug: v.string(),
    scenarioName: v.string(),
  },
  handler: async (ctx, args) => {
    return ensureStoryStripFolderCore(ctx, args);
  },
});

// Check if first strip already exists (and ensure folder exists)
// Returns { saved: true } if strips exist (meaning this is a regeneration, not first strip)
export const checkFirstStripExists = internalMutation({
  args: {
    storySlug: v.string(),
    scenarioName: v.string(),
  },
  handler: async (ctx, args) => {
    const folderPath = `comics/stories/${args.storySlug}/strips/${args.scenarioName}`;

    // Check if folder exists
    const folder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: folderPath },
    );

    // Create folder if it doesn't exist
    if (!folder) {
      await ctx.runMutation(
        components.assetManager.assetManager.createFolderByPath,
        { path: folderPath },
      );
      // Folder just created, no strips can exist
      return { saved: false };
    }

    // Check for existing published strips
    const publishedFiles = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedFilesInFolder,
      { folderPath },
    );

    const existingStrips = publishedFiles.filter((f) =>
      /\.(png|jpg|jpeg|webp)$/i.test(f.basename),
    );

    return { saved: existingStrips.length > 0 };
  },
});

// ============== MIGRATION ==============

// Migrate existing data to story-based structure
export const migrateToStories = mutation({
  args: {
    targetStorySlug: v.optional(v.string()),
    targetStoryName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const storySlug = args.targetStorySlug ?? "default";
    const storyName = args.targetStoryName ?? "Default Story";

    const storyPath = `comics/stories/${storySlug}`;

    // Check if story already exists
    const existingStory = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: storyPath },
    );

    if (existingStory) {
      return { success: false, message: `Story "${storySlug}" already exists` };
    }

    const now = Date.now();
    const migratedScenarios: string[] = [];
    const migratedStrips: string[] = [];

    // 1. Create story folder structure
    await ctx.runMutation(
      components.assetManager.assetManager.createFolderByPath,
      { path: storyPath },
    );
    await ctx.runMutation(
      components.assetManager.assetManager.createFolderByPath,
      { path: `${storyPath}/scenarios` },
    );
    await ctx.runMutation(
      components.assetManager.assetManager.createFolderByPath,
      { path: `${storyPath}/strips` },
    );

    // 2. Create story metadata
    await ctx.runMutation(components.assetManager.assetManager.commitVersion, {
      folderPath: storyPath,
      basename: "metadata.json",
      publish: true,
      extra: {
        slug: storySlug,
        name: storyName,
        description: "Migrated from legacy structure",
        createdAt: now,
        updatedAt: now,
      },
    });

    // 3. Migrate scenario order
    const configAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: "comics/config" },
    );
    const orderAsset = configAssets.find(
      (a) => a.basename === "scenario-order.json",
    );
    if (orderAsset?.extra) {
      await ctx.runMutation(
        components.assetManager.assetManager.commitVersion,
        {
          folderPath: storyPath,
          basename: "scenario-order.json",
          publish: true,
          extra: orderAsset.extra,
        },
      );
    }

    // 4. Migrate scenarios
    const scenarioAssets = await ctx.runQuery(
      components.assetManager.assetManager.listPublishedAssetsInFolder,
      { folderPath: "comics/scenarios" },
    );

    for (const asset of scenarioAssets) {
      if (asset.basename.endsWith(".json") && asset.extra) {
        await ctx.runMutation(
          components.assetManager.assetManager.commitVersion,
          {
            folderPath: `${storyPath}/scenarios`,
            basename: asset.basename,
            publish: true,
            extra: asset.extra,
          },
        );
        migratedScenarios.push(asset.basename);
      }
    }

    // 5. Migrate strips using createVersionFromStorageId (zero-copy)
    const stripFolders = await ctx.runQuery(
      components.assetManager.assetManager.listFolders,
      { parentPath: "comics/strips" },
    );

    for (const folder of stripFolders) {
      const scenarioName = folder.name;
      const newStripPath = `${storyPath}/strips/${scenarioName}`;

      // Create strip folder in new location
      await ctx.runMutation(
        components.assetManager.assetManager.createFolderByPath,
        { path: newStripPath },
      );

      // Get published files with storageId
      const publishedFiles = await ctx.runQuery(
        components.assetManager.assetManager.listPublishedFilesInFolder,
        { folderPath: folder.path },
      );

      // Copy each image to new location (same storageId = zero-copy)
      for (const file of publishedFiles) {
        if (/\.(png|jpg|jpeg|webp)$/i.test(file.basename) && file.storageId) {
          await ctx.runMutation(
            components.assetManager.assetManager.createVersionFromStorageId,
            {
              folderPath: newStripPath,
              basename: file.basename,
              storageId: file.storageId,
              publish: true,
              label: "Migrated from legacy",
            },
          );
          migratedStrips.push(`${scenarioName}/${file.basename}`);
        }
      }
    }

    return {
      success: true,
      storySlug,
      storyName,
      migratedScenarios,
      migratedStrips,
      message: `Migrated ${migratedScenarios.length} scenarios and ${migratedStrips.length} strips to story "${storyName}"`,
    };
  },
});

// Migrate strips to an existing story (patch for already-migrated stories)
export const migrateStripsToStory = mutation({
  args: {
    storySlug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const storyPath = `comics/stories/${args.storySlug}`;

    // Check if story exists
    const storyFolder = await ctx.runQuery(
      components.assetManager.assetManager.getFolder,
      { path: storyPath },
    );

    if (!storyFolder) {
      return { success: false, message: `Story "${args.storySlug}" not found` };
    }

    const migratedStrips: string[] = [];

    // Get all legacy strip folders
    const stripFolders = await ctx.runQuery(
      components.assetManager.assetManager.listFolders,
      { parentPath: "comics/strips" },
    );

    for (const folder of stripFolders) {
      const scenarioName = folder.name;
      const newStripPath = `${storyPath}/strips/${scenarioName}`;

      // Ensure folder exists
      const existingFolder = await ctx.runQuery(
        components.assetManager.assetManager.getFolder,
        { path: newStripPath },
      );

      if (!existingFolder) {
        await ctx.runMutation(
          components.assetManager.assetManager.createFolderByPath,
          { path: newStripPath },
        );
      }

      // Get published files with storageId
      const publishedFiles = await ctx.runQuery(
        components.assetManager.assetManager.listPublishedFilesInFolder,
        { folderPath: folder.path },
      );

      for (const file of publishedFiles) {
        if (/\.(png|jpg|jpeg|webp)$/i.test(file.basename) && file.storageId) {
          // Check if already exists in destination
          const existingAsset = await ctx.runQuery(
            components.assetManager.assetManager.getAsset,
            { folderPath: newStripPath, basename: file.basename },
          );

          if (!existingAsset) {
            await ctx.runMutation(
              components.assetManager.assetManager.createVersionFromStorageId,
              {
                folderPath: newStripPath,
                basename: file.basename,
                storageId: file.storageId,
                publish: true,
                label: "Migrated from legacy",
              },
            );
            migratedStrips.push(`${scenarioName}/${file.basename}`);
          }
        }
      }
    }

    return {
      success: true,
      storySlug: args.storySlug,
      migratedStrips,
      message: `Migrated ${migratedStrips.length} strips to story "${args.storySlug}"`,
    };
  },
});
