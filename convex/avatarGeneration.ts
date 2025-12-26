import { v } from "convex/values";
import { action, mutation, internalAction, internalMutation } from "./_generated/server";
import { internal, components } from "./_generated/api";
import OpenAI from "openai";

const PROPOSALS_FOLDER = "avatar-proposals";

export const generateAvatarOptions = internalAction({
  args: {
    bookPath: v.string(),
    characterSlug: v.string(),
    characterDisplayName: v.string(),
    visualPrompt: v.string(),
  },
  returns: v.object({ success: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, { bookPath, characterSlug, characterDisplayName, visualPrompt }) => {
    try {
      const bookFolder = await ctx.runQuery(components.assetManager.assetManager.getFolder, {
        path: bookPath,
      });

      if (!bookFolder) {
        return { success: false, error: "Book folder not found" };
      }

      const bookExtra = (bookFolder.extra as Record<string, unknown>) || {};
      const avatarStyle = (bookExtra.avatarStyle as string) || "";

      if (!avatarStyle) {
        console.warn(`[generateAvatarOptions] No avatarStyle found for book ${bookPath}`);
      }

      const finalPrompt = `${avatarStyle}\n${characterDisplayName}\n${visualPrompt}`;

      const characterPath = `${bookPath}/characters/${characterSlug}`;
      await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
        characterPath,
        state: "generating",
        proposalUrls: undefined,
      });

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
          characterPath,
          state: "error",
          proposalUrls: undefined,
        });
        return { success: false, error: "OPENAI_API_KEY not configured" };
      }

      const openai = new OpenAI({ apiKey });

      const proposalsPath = `${bookPath}/${PROPOSALS_FOLDER}/${characterSlug}`;

      const generateAndUpload = async (optionNumber: number): Promise<string | null> => {
        try {
          const result = await openai.images.generate({
            model: "gpt-image-1.5",
            prompt: finalPrompt,
            quality: "low",
            size: "1024x1024",
          });

          const imageBase64 = result.data?.[0]?.b64_json;
          if (!imageBase64) {
            console.error(`[generateAvatarOptions] No image data for option ${optionNumber}`);
            return null;
          }

          const binaryData = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
          const blob = new Blob([binaryData], { type: "image/png" });

          const basename = `option-${optionNumber}.png`;

          const { intentId, uploadUrl, backend } = await ctx.runMutation(
            internal.generateUploadUrl.startUploadInternal,
            { folderPath: proposalsPath, basename, publish: true },
          );

          const uploadRes = await fetch(uploadUrl, {
            method: backend === "r2" ? "PUT" : "POST",
            body: blob,
            headers: { "Content-Type": "image/png" },
          });

          if (!uploadRes.ok) {
            console.error(
              `[generateAvatarOptions] Upload failed for option ${optionNumber}: ${uploadRes.status}`,
            );
            return null;
          }

          const uploadResponse = backend === "convex" ? await uploadRes.json() : undefined;

          const { versionId } = await ctx.runMutation(
            internal.generateUploadUrl.finishUploadInternal,
            { intentId, uploadResponse, size: blob.size, contentType: "image/png" },
          );

          const urlInfo = await ctx.runQuery(
            components.assetManager.assetFsHttp.getVersionPreviewUrl,
            { versionId: versionId as any },
          );

          return urlInfo?.url || null;
        } catch (error) {
          console.error(`[generateAvatarOptions] Error generating option ${optionNumber}:`, error);
          return null;
        }
      };

      const [url1, url2] = await Promise.all([generateAndUpload(1), generateAndUpload(2)]);

      if (!url1 && !url2) {
        await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
          characterPath,
          state: "error",
          proposalUrls: undefined,
        });
        return { success: false, error: "Failed to generate both avatar options" };
      }

      const proposalUrls = [url1, url2].filter((u): u is string => u !== null);

      await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
        characterPath,
        state: "ready",
        proposalUrls,
      });

      console.log(
        `[generateAvatarOptions] Generated ${proposalUrls.length} options for ${characterDisplayName}`,
      );
      return { success: true };
    } catch (error) {
      console.error("[generateAvatarOptions] Error:", error);

      const characterPath = `${bookPath}/characters/${characterSlug}`;
      await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
        characterPath,
        state: "error",
        proposalUrls: undefined,
      });

      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

export const updateCharacterAvatarState = internalMutation({
  args: {
    characterPath: v.string(),
    state: v.union(
      v.literal("generating"),
      v.literal("ready"),
      v.literal("error"),
      v.literal("none"),
    ),
    proposalUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { characterPath, state, proposalUrls }) => {
    const folder = await ctx.runQuery(components.assetManager.assetManager.getFolder, {
      path: characterPath,
    });

    if (!folder) {
      console.error(`[updateCharacterAvatarState] Folder not found: ${characterPath}`);
      return;
    }

    const existingExtra = (folder.extra as Record<string, unknown>) || {};

    await ctx.runMutation(components.assetManager.assetManager.updateFolder, {
      path: characterPath,
      extra: { ...existingExtra, avatarGenerationState: state, avatarProposalUrls: proposalUrls },
    });
  },
});

export const selectAvatar = internalAction({
  args: { bookPath: v.string(), characterSlug: v.string(), selectedOptionUrl: v.string() },
  returns: v.object({ success: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, { bookPath, characterSlug, selectedOptionUrl }) => {
    const startTime = Date.now();
    const log = (step: string) =>
      console.log(`[selectAvatar] ${step}: ${Date.now() - startTime}ms`);

    try {
      const characterPath = `${bookPath}/characters/${characterSlug}`;
      log("start");

      const response = await fetch(selectedOptionUrl);
      if (!response.ok) {
        return { success: false, error: "Failed to fetch selected image" };
      }
      log("fetched proposal image");

      const imageBuffer = await response.arrayBuffer();
      const imageBytes = new Uint8Array(imageBuffer);
      log(`image buffer ready (${imageBuffer.byteLength} bytes)`);

      const {
        intentId: largeIntentId,
        uploadUrl: largeUploadUrl,
        backend: largeBackend,
      } = await ctx.runMutation(internal.generateUploadUrl.startUploadInternal, {
        folderPath: characterPath,
        basename: "avatar-large.png",
        publish: true,
      });
      log("got large upload URL");

      const largeUploadRes = await fetch(largeUploadUrl, {
        method: largeBackend === "r2" ? "PUT" : "POST",
        body: imageBytes,
        headers: { "Content-Type": "image/png" },
      });

      if (!largeUploadRes.ok) {
        return { success: false, error: "Failed to upload avatar-large" };
      }
      log("uploaded avatar-large");

      const largeUploadResponse =
        largeBackend === "convex" ? await largeUploadRes.json() : undefined;

      await ctx.runMutation(internal.generateUploadUrl.finishUploadInternal, {
        intentId: largeIntentId,
        uploadResponse: largeUploadResponse,
        size: imageBuffer.byteLength,
        contentType: "image/png",
      });
      log("finished avatar-large upload");

      const largeUrlInfo = await ctx.runQuery(
        components.assetManager.assetFsHttp.getVersionPreviewUrl,
        {
          versionId: (
            await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
              folderPath: characterPath,
              basename: "avatar-large.png",
            })
          )[0]?._id as any,
        },
      );

      if (!largeUrlInfo?.url) {
        return { success: false, error: "Failed to get avatar-large URL" };
      }
      log("got avatar-large URL");

      const resizeResult = await ctx.runAction(internal.imageProcessing.resizeToWebpViaWorker, {
        sourceUrl: largeUrlInfo.url,
        maxWidth: 400,
        quality: 80,
      });
      log(`resized to webp (worker timing: ${JSON.stringify(resizeResult.timing)})`);

      const webpBinary = Uint8Array.from(atob(resizeResult.data), (c) => c.charCodeAt(0));
      const webpBlob = new Blob([webpBinary], { type: "image/webp" });

      const {
        intentId: smallIntentId,
        uploadUrl: smallUploadUrl,
        backend: smallBackend,
      } = await ctx.runMutation(internal.generateUploadUrl.startUploadInternal, {
        folderPath: characterPath,
        basename: "avatar.webp",
        publish: true,
      });
      log("got small upload URL");

      const smallUploadRes = await fetch(smallUploadUrl, {
        method: smallBackend === "r2" ? "PUT" : "POST",
        body: webpBlob,
        headers: { "Content-Type": "image/webp" },
      });

      if (!smallUploadRes.ok) {
        return { success: false, error: "Failed to upload avatar.webp" };
      }
      log("uploaded avatar.webp");

      const smallUploadResponse =
        smallBackend === "convex" ? await smallUploadRes.json() : undefined;

      await ctx.runMutation(internal.generateUploadUrl.finishUploadInternal, {
        intentId: smallIntentId,
        uploadResponse: smallUploadResponse,
        size: webpBlob.size,
        contentType: "image/webp",
      });
      log("finished avatar.webp upload");

      await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
        characterPath,
        state: "none",
        proposalUrls: undefined,
      });
      log("updated state to none");

      console.log(
        `[selectAvatar] Successfully completed for ${characterSlug} in ${Date.now() - startTime}ms`,
      );
      return { success: true };
    } catch (error) {
      console.error("[selectAvatar] Error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

export const startAvatarGeneration = action({
  args: {
    bookPath: v.string(),
    characterSlug: v.string(),
    characterDisplayName: v.string(),
    visualPrompt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.avatarGeneration.generateAvatarOptions, args);
    return null;
  },
});

export const confirmAvatarSelection = action({
  args: { bookPath: v.string(), characterSlug: v.string(), selectedOptionUrl: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    return await ctx.runAction(internal.avatarGeneration.selectAvatar, args);
  },
});

export const updateBookGraphicalStyle = mutation({
  args: {
    bookPath: v.string(),
    backgroundStyle: v.optional(v.string()),
    periodStyle: v.optional(v.string()),
    avatarStyle: v.optional(v.string()),
  },
  handler: async (ctx, { bookPath, backgroundStyle, periodStyle, avatarStyle }) => {
    const folder = await ctx.runQuery(components.assetManager.assetManager.getFolder, {
      path: bookPath,
    });

    if (!folder) {
      throw new Error(`Book folder not found: ${bookPath}`);
    }

    const existingExtra = (folder.extra as Record<string, unknown>) || {};
    const updatedExtra = { ...existingExtra };

    if (backgroundStyle !== undefined) updatedExtra.backgroundStyle = backgroundStyle;
    if (periodStyle !== undefined) updatedExtra.periodStyle = periodStyle;
    if (avatarStyle !== undefined) updatedExtra.avatarStyle = avatarStyle;

    await ctx.runMutation(components.assetManager.assetManager.updateFolder, {
      path: bookPath,
      extra: updatedExtra,
    });

    return { success: true };
  },
});
