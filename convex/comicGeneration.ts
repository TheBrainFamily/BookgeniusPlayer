// convex/comicGeneration.ts
import { v } from "convex/values";
import { mutation, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { storyContext } from "./prompts/storyContext";

// Type definitions
interface CharacterMetadata {
  name: string;
  organism: string;
  power: string;
  archetype: string;
  bio: string;
}

interface Frame {
  scene: string;
  characters: string[];
  speaker: string;
  dialogue: string;
  imageType: "comic" | "superhero";
}

interface Scenario {
  name: string;
  description: string;
  characterImages: Record<string, "comic" | "superhero" | "both">;
  frames: Frame[];
}

// Start generation - creates submission and schedules the action
// Supports both legacy path (comics/scenarios/{name}.json) and
// story-scoped path (comics/stories/{storySlug}/scenarios/{name}.json)
export const startGeneration = mutation({
  args: {
    scenarioPath: v.string(),
    storySlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Build the full path if storySlug is provided
    let scenarioPath = args.scenarioPath;
    if (args.storySlug && !args.scenarioPath.includes("/stories/")) {
      // Convert from simple name to story-scoped path
      const scenarioName = args.scenarioPath
        .replace("comics/scenarios/", "")
        .replace(".json", "");
      scenarioPath = `comics/stories/${args.storySlug}/scenarios/${scenarioName}.json`;
    }

    // Create submission record
    const submissionId = await ctx.db.insert("comicSubmissions", {
      scenarioPath,
      status: "pending",
      progress: 0,
      progressMessage: "Waiting for the artist...",
      createdAt: Date.now(),
    });

    // Schedule the generation action
    await ctx.scheduler.runAfter(
      0,
      internal.comicGeneration.generateComicStrip,
      {
        submissionId,
        scenarioPath,
      },
    );

    return submissionId;
  },
});

// Internal action that performs the actual generation
export const generateComicStrip = internalAction({
  args: {
    submissionId: v.id("comicSubmissions"),
    scenarioPath: v.string(),
  },
  handler: async (ctx, args) => {
    const { submissionId, scenarioPath } = args;

    try {
      // Update status to processing
      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: submissionId,
        progress: 5,
        progressMessage: "Reading the script...",
      });

      // Parse the scenario path to determine if it's story-scoped
      // Story-scoped: comics/stories/{storySlug}/scenarios/{name}.json
      // Legacy: comics/scenarios/{name}.json
      const storyMatch = scenarioPath.match(
        /^comics\/stories\/([^/]+)\/scenarios\/([^/]+)\.json$/,
      );
      const legacyMatch = scenarioPath.match(
        /^comics\/scenarios\/([^/]+)\.json$/,
      );

      let scenario: Scenario;

      if (storyMatch) {
        // Story-scoped scenario
        const [, storySlug, scenarioName] = storyMatch;
        const scenarioData = await ctx.runQuery(api.comics.getStoryScenario, {
          storySlug,
          scenarioName,
        });

        if (!scenarioData?.scenario) {
          throw new Error(`Scenario not found: ${scenarioPath}`);
        }
        scenario = scenarioData.scenario as Scenario;
      } else if (legacyMatch) {
        // Legacy scenario path
        const [, scenarioName] = legacyMatch;
        const scenarioData = await ctx.runQuery(api.comics.getScenario, {
          scenarioName,
        });

        if (!scenarioData?.scenario) {
          throw new Error(`Scenario not found: ${scenarioPath}`);
        }
        scenario = scenarioData.scenario as Scenario;
      } else {
        throw new Error(`Invalid scenario path format: ${scenarioPath}`);
      }

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: submissionId,
        progress: 15,
        progressMessage: "Gathering the cast...",
      });

      // Load characters
      const characters = await ctx.runQuery(api.comics.listCharacters, {});
      const characterMap = new Map(characters.map((c) => [c.key, c]));

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: submissionId,
        progress: 25,
        progressMessage: "Setting the scene...",
      });

      // Build the prompt parts
      const parts: Array<{
        text?: string;
        inlineData?: { data: string; mimeType: string };
      }> = [];

      // Add character references with images
      for (const [charKey, imageType] of Object.entries(
        scenario.characterImages,
      )) {
        const character = characterMap.get(charKey);
        if (!character) {
          console.warn(`Character not found: ${charKey}`);
          continue;
        }

        const metadata = character.metadata;
        const loadComic = imageType === "comic" || imageType === "both";
        const loadSuperhero = imageType === "superhero" || imageType === "both";

        // Add comic version
        if (loadComic && character.comicImageUrl) {
          const imageData = await fetchImageAsBase64(character.comicImageUrl);
          if (imageData) {
            parts.push({
              text: `Reference character: ${metadata?.name ?? charKey} (comic version)\n`,
            });
            parts.push({ inlineData: imageData });
          }
        }

        // Add superhero version
        if (loadSuperhero && character.superheroImageUrl) {
          const imageData = await fetchImageAsBase64(
            character.superheroImageUrl,
          );
          if (imageData) {
            parts.push({
              text: `Reference character: ${metadata?.name ?? charKey} (superhero version)`,
            });
            parts.push({ inlineData: imageData });
          }
        }
      }

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: submissionId,
        progress: 40,
        progressMessage: "Sketching the panels...",
      });

      // Add instructions
      parts.push({
        text: `\nUse the reference characters above exactly for consistency (match faces, clothing, poses, and styles precisely to their references).\nStrictly match the reference images for all characters—do not deviate from their appearances.\n\nGenerate a complete ${scenario.frames.length}-panel vertical comic strip (9:16 aspect ratio) with clean panel borders, speech bubbles, and dynamic layout.\n\n`,
      });

      // Add frames description
      const framesText = buildFramesText(scenario, characterMap);
      parts.push({ text: framesText });

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: submissionId,
        progress: 50,
        progressMessage: "Painting the comic strip...",
      });

      // Call Gemini API
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable not set");
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts,
              },
            ],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              imageConfig: {
                aspectRatio: "9:16",
                imageSize: "2K",
              },
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: submissionId,
        progress: 80,
        progressMessage: "Adding finishing touches...",
      });

      const result = await response.json();

      // Find the image in the response
      let imageData: { data: string; mimeType: string } | null = null;

      if (result.candidates?.[0]?.content?.parts) {
        for (const part of result.candidates[0].content.parts) {
          if (part.inlineData) {
            imageData = {
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType || "image/png",
            };
            break;
          }
        }
      }

      if (!imageData) {
        throw new Error("No image generated in response");
      }

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: submissionId,
        progress: 90,
        progressMessage: "Framing the artwork...",
      });

      // Convert base64 to blob and upload to component storage
      const binaryData = Uint8Array.from(atob(imageData.data), (c) =>
        c.charCodeAt(0),
      );
      const blob = new Blob([binaryData], { type: imageData.mimeType });

      // Require story-scoped scenarios
      if (!storyMatch) {
        throw new Error(
          "Only story-scoped scenarios are supported. Path must be: comics/stories/{storySlug}/scenarios/{name}.json",
        );
      }

      const [, storySlug, scenarioName] = storyMatch;
      const folderPath = `comics/stories/${storySlug}/strips/${scenarioName}`;
      const basename = `${scenarioName}.png`;

      // Check if strips already exist (if so, this is a regeneration, not first strip)
      const { saved: stripsExist } = await ctx.runMutation(
        internal.comics.checkFirstStripExists,
        { storySlug, scenarioName },
      );
      const shouldAutoSave = !stripsExist;

      // Start upload to get URL to component's storage
      const { intentId, uploadUrl, backend } = await ctx.runMutation(
        internal.generateUploadUrl.startUploadInternal,
        {
          folderPath,
          basename,
          publish: shouldAutoSave, // Auto-publish for first strips
          label: shouldAutoSave
            ? `Auto-saved at ${new Date().toISOString()}`
            : undefined,
        },
      );

      // R2 uses PUT, Convex uses POST
      const uploadRes = await fetch(uploadUrl, {
        method: backend === "r2" ? "PUT" : "POST",
        body: blob,
        headers: { "Content-Type": imageData.mimeType },
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      // Parse response - Convex returns JSON, R2 returns empty
      const uploadResponse = backend === "convex" ? await uploadRes.json() : undefined;

      // Finish the upload to create the asset version
      const { versionId } = await ctx.runMutation(
        internal.generateUploadUrl.finishUploadInternal,
        {
          intentId,
          uploadResponse,
          size: blob.size,
          contentType: imageData.mimeType,
        },
      );

      // Mark submission as complete with the versionId
      await ctx.runMutation(internal.comicSubmissions.completeWithVersion, {
        id: submissionId,
        resultVersionId: versionId,
      });

      // For auto-saved first strips, remove the submission UI
      if (shouldAutoSave) {
        console.log(`Auto-saved first strip for ${storySlug}/${scenarioName}`);
        await ctx.runMutation(internal.comicSubmissions.removeInternal, {
          id: submissionId,
        });
      }
    } catch (error) {
      console.error("Generation failed:", error);
      await ctx.runMutation(internal.comicSubmissions.fail, {
        id: submissionId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

// Helper function to convert ArrayBuffer to base64 without stack overflow
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000; // 32KB chunks to avoid stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// Helper function to fetch image and convert to base64
async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch image: ${url}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    return {
      data: base64,
      mimeType: contentType,
    };
  } catch (error) {
    console.warn(`Error fetching image ${url}:`, error);
    return null;
  }
}

// Helper function to build frames text for the prompt
function buildFramesText(
  scenario: Scenario,
  characterMap: Map<string, { metadata: CharacterMetadata | null }>,
): string {
  return scenario.frames
    .map((frame, i) => {
      const character = characterMap.get(
        frame.speaker.replace("-superhero", ""),
      );
      const speakerName = character?.metadata?.name || frame.speaker;
      const imageTypeLabel =
        frame.imageType === "superhero" ? " (superhero version)" : "";

      return `### Frame ${i + 1}
- **Scene**: ${frame.scene}
- **Characters present**: ${frame.characters.join(", ")}
- **Speaker**: ${speakerName}${imageTypeLabel}
- **Dialogue**: "${frame.dialogue}"
- **Use image type**: ${frame.imageType}`;
    })
    .join("\n\n");
}

// ============== STORY GENERATION FROM DESCRIPTION ==============

// Types for Gemini structured output (uses array format for characterImages)
interface GeminiCharacterImage {
  character: string;
  imageType: "comic" | "superhero" | "both";
}

interface GeminiFrame {
  scene: string;
  characters: string[];
  speaker: string;
  dialogue: string;
  imageType: "comic" | "superhero";
}

interface GeminiScenario {
  name: string;
  description: string;
  characterImages: GeminiCharacterImage[];
  frames: GeminiFrame[];
}

interface GeminiStoryOutput {
  storyName: string;
  storyDescription: string;
  scenarios: GeminiScenario[];
}

// Convert characterImages from array to object format
function convertCharacterImagesToObject(
  arr: GeminiCharacterImage[],
): Record<string, "comic" | "superhero" | "both"> {
  const result: Record<string, "comic" | "superhero" | "both"> = {};
  for (const item of arr) {
    result[item.character] = item.imageType;
  }
  return result;
}

// Slugify helper
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Build prompt for story generation
function buildStoryGenerationPrompt(
  description: string,
  characters: Array<{
    key: string;
    name: string;
    organism: string;
    power: string;
    archetype: string;
    bio: string;
  }>,
): string {
  const characterList = characters
    .map(
      (c) => `
- **${c.name}** (key: "${c.key}")
  - Organism: ${c.organism}
  - Power: ${c.power}
  - Archetype: ${c.archetype}
  - Bio: ${c.bio}`,
    )
    .join("\n");

  const characterKeys = characters.map((c) => `"${c.key}"`).join(", ");

  return `You are a comic story writer. Loosely based on the following description, create a compelling comic story with 3-7 scenarios (episodes).

## Story Description from User
${description}

## Additional Context
${storyContext}

## Available Characters
${characterList}

## Important Rules
1. Generate a catchy, concise story name (2-4 words)
2. Write a refined story description (1-2 sentences)
3. Create 3-7 scenarios that form a cohesive narrative arc
4. Each scenario should have:
   - A descriptive name (lowercase with hyphens, e.g., "hero-awakens", "final-battle")
   - A brief description of what happens
   - List of character images needed (use ONLY character keys: ${characterKeys})
   - 3-5 frames with scene descriptions, dialogue in Polish, and character interactions
5. ONLY use characters from the list above - do not invent new characters
6. Ensure continuity between scenarios - characters should develop, plot should progress
7. Dialogue should be natural, witty, and in Polish
8. Each frame should have exactly one speaker
9. Don't overuse the examples from the additional context nor from the character details, use your own imagination and creativity to create a unique story, imagining what the characters could be interested in, how would they think, what would they do and say. So far, without this instruction, in every story you created people said basically the same things and it was boring.
Return valid JSON matching the schema.`;
}

// Build the JSON schema for Gemini structured output
function buildStoryOutputSchema(characterKeys: string[]) {
  return {
    type: "object",
    required: ["storyName", "storyDescription", "scenarios"],
    properties: {
      storyName: {
        type: "string",
        description: "Catchy story name (2-4 words)",
      },
      storyDescription: {
        type: "string",
        description: "Brief refined story description (1-2 sentences)",
      },
      scenarios: {
        type: "array",
        description: "Array of 3-7 scenarios that form the story",
        items: {
          type: "object",
          required: ["name", "description", "characterImages", "frames"],
          properties: {
            name: {
              type: "string",
              description: "Scenario name (lowercase with hyphens)",
            },
            description: {
              type: "string",
              description: "Brief description of this scenario",
            },
            characterImages: {
              type: "array",
              description: "Which character images to use",
              items: {
                type: "object",
                required: ["character", "imageType"],
                properties: {
                  character: {
                    type: "string",
                    enum: characterKeys,
                  },
                  imageType: {
                    type: "string",
                    enum: ["comic", "superhero", "both"],
                  },
                },
              },
            },
            frames: {
              type: "array",
              description: "Array of 3-5 frames",
              items: {
                type: "object",
                required: [
                  "scene",
                  "characters",
                  "speaker",
                  "dialogue",
                  "imageType",
                ],
                properties: {
                  scene: {
                    type: "string",
                    description:
                      "Visual description for the AI image generator",
                  },
                  characters: {
                    type: "array",
                    description: "Character keys present in this frame",
                    items: {
                      type: "string",
                      enum: characterKeys,
                    },
                  },
                  speaker: {
                    type: "string",
                    description: "Character key of who is speaking",
                    enum: characterKeys,
                  },
                  dialogue: {
                    type: "string",
                    description: "Dialogue text in Polish",
                  },
                  imageType: {
                    type: "string",
                    enum: ["comic", "superhero"],
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

// Public mutation to start story generation
export const startStoryGeneration = mutation({
  args: {
    description: v.string(),
  },
  handler: async (ctx, args) => {
    // Create a tracking record
    const generationId = await ctx.db.insert("comicSubmissions", {
      scenarioPath: "story-generation",
      status: "pending",
      progress: 0,
      progressMessage: "Starting your story...",
      createdAt: Date.now(),
    });

    // Schedule the internal action
    await ctx.scheduler.runAfter(
      0,
      internal.comicGeneration.generateStoryFromDescription,
      {
        generationId,
        description: args.description,
      },
    );

    return generationId;
  },
});

// Internal action that generates a story from description using Gemini
export const generateStoryFromDescription = internalAction({
  args: {
    generationId: v.id("comicSubmissions"),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const { generationId, description } = args;

    try {
      // Update progress
      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: generationId,
        progress: 10,
        progressMessage: "Gathering the cast...",
      });

      // 1. Fetch characters dynamically from DB
      const characters = await ctx.runQuery(api.comics.listCharacters, {});

      const characterContext = characters.map((c) => ({
        key: c.key,
        name: c.metadata?.name ?? c.key,
        organism: c.metadata?.organism ?? "",
        power: c.metadata?.power ?? "",
        archetype: c.metadata?.archetype ?? "",
        bio: c.metadata?.bio ?? "",
      }));

      const characterKeys = characters.map((c) => c.key);

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: generationId,
        progress: 20,
        progressMessage: "Brainstorming ideas...",
      });

      // 2. Build prompt
      const prompt = buildStoryGenerationPrompt(description, characterContext);
      const schema = buildStoryOutputSchema(characterKeys);

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: generationId,
        progress: 30,
        progressMessage: "Writing up your story...",
      });

      // 3. Call Gemini with structured JSON output
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable not set");
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: schema,
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: generationId,
        progress: 60,
        progressMessage: "Polishing the plot...",
      });

      // 4. Parse response
      const result = await response.json();

      if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error("No text response from Gemini");
      }

      const storyOutput: GeminiStoryOutput = JSON.parse(
        result.candidates[0].content.parts[0].text,
      );

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: generationId,
        progress: 70,
        progressMessage: "Naming your story...",
      });

      // 5. Generate slug from story name
      const slug = slugify(storyOutput.storyName);

      // 6. Create story (use internal mutation - no auth needed for scheduled actions)
      await ctx.runMutation(internal.comics.createStoryInternal, {
        slug,
        name: storyOutput.storyName,
        description: storyOutput.storyDescription,
      });

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: generationId,
        progress: 80,
        progressMessage: "Writing the episodes...",
      });

      // 7. Convert and save each scenario
      const scenarioNames: string[] = [];
      for (const geminiScenario of storyOutput.scenarios) {
        // Convert characterImages from array to object format
        const characterImages = convertCharacterImagesToObject(
          geminiScenario.characterImages,
        );

        const scenario: Scenario = {
          name: geminiScenario.name,
          description: geminiScenario.description,
          characterImages,
          frames: geminiScenario.frames,
        };

        await ctx.runMutation(internal.comics.createStoryScenarioInternal, {
          storySlug: slug,
          name: geminiScenario.name,
          scenario,
        });

        scenarioNames.push(geminiScenario.name);
      }

      // 8. Save the scenario order so they appear in the correct sequence
      await ctx.runMutation(internal.comics.saveStoryScenarioOrderInternal, {
        storySlug: slug,
        order: scenarioNames,
      });

      // 9. Schedule strip generation for all scenarios in background
      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: generationId,
        progress: 90,
        progressMessage: "Sending scenes to the artists...",
      });

      for (const scenarioName of scenarioNames) {
        const scenarioPath = `comics/stories/${slug}/scenarios/${scenarioName}.json`;

        // Create submission record for strip generation
        const stripSubmissionId = await ctx.runMutation(
          internal.comicSubmissions.createInternal,
          {
            scenarioPath,
            progressMessage: "Waiting for the artist...",
          },
        );

        // Schedule the strip generation
        await ctx.scheduler.runAfter(
          0,
          internal.comicGeneration.generateComicStrip,
          {
            submissionId: stripSubmissionId,
            scenarioPath,
          },
        );
      }

      // 10. Mark story generation as complete
      const firstScenarioName = scenarioNames[0] ?? "";

      await ctx.runMutation(internal.comicSubmissions.updateProgress, {
        id: generationId,
        progress: 100,
        progressMessage: `Story created with ${scenarioNames.length} scenarios`,
      });

      await ctx.runMutation(internal.comicSubmissions.completeStoryGeneration, {
        id: generationId,
        slug,
        storyName: storyOutput.storyName,
        firstScenarioName,
      });
    } catch (error) {
      console.error("Story generation failed:", error);
      await ctx.runMutation(internal.comicSubmissions.fail, {
        id: generationId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});
