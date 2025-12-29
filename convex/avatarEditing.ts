import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal, components } from "./_generated/api";
import OpenAI, { toFile } from "openai";

const PROPOSALS_FOLDER = "avatar-proposals";

export const editAvatarWithInstructions = internalAction({
  args: {
    bookPath: v.string(),
    characterSlug: v.string(),
    characterDisplayName: v.string(),
    instructions: v.string(),
  },
  returns: v.object({ success: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, { bookPath, characterSlug, characterDisplayName, instructions }) => {
    const characterPath = `${bookPath}/characters/${characterSlug}`;

    try {
      await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
        characterPath,
        state: "generating",
        proposalUrls: undefined,
      });

      const versions = await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
        folderPath: characterPath,
        basename: "avatar-large.png",
      });

      const publishedVersion = versions.find((v) => v.state === "published");
      if (!publishedVersion) {
        await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
          characterPath,
          state: "error",
          proposalUrls: undefined,
        });
        return { success: false, error: "No existing avatar found (avatar-large.png)" };
      }

      const urlInfo = await ctx.runQuery(components.assetManager.assetFsHttp.getVersionPreviewUrl, {
        versionId: publishedVersion._id as any,
      });

      if (!urlInfo?.url) {
        await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
          characterPath,
          state: "error",
          proposalUrls: undefined,
        });
        return { success: false, error: "Failed to get avatar URL" };
      }

      const imageResponse = await fetch(urlInfo.url);
      if (!imageResponse.ok) {
        await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
          characterPath,
          state: "error",
          proposalUrls: undefined,
        });
        return { success: false, error: "Failed to fetch current avatar" };
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const imageFile = await toFile(new Uint8Array(imageBuffer), "avatar.png", {
        type: "image/png",
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

      const bookFolder = await ctx.runQuery(components.assetManager.assetManager.getFolder, {
        path: bookPath,
      });
      const bookExtra = (bookFolder?.extra as Record<string, unknown>) || {};
      const avatarStyle = (bookExtra.avatarStyle as string) || "";

      const editPrompt = avatarStyle
        ? `${avatarStyle}\n${characterDisplayName}\n${instructions}`
        : `${characterDisplayName}\n${instructions}`;

      const proposalsPath = `${bookPath}/${PROPOSALS_FOLDER}/${characterSlug}`;

      const generateAndUpload = async (optionNumber: number): Promise<string | null> => {
        try {
          const result = await openai.images.edit({
            model: "gpt-image-1.5",
            image: imageFile,
            prompt: editPrompt,
            size: "1024x1024",
            quality: "medium",
          });

          const imageBase64 = result.data?.[0]?.b64_json;
          if (!imageBase64) {
            console.error(`[editAvatarWithInstructions] No image data for option ${optionNumber}`);
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
              `[editAvatarWithInstructions] Upload failed for option ${optionNumber}: ${uploadRes.status}`,
            );
            return null;
          }

          const uploadResponse = backend === "convex" ? await uploadRes.json() : undefined;

          const { versionId } = await ctx.runMutation(
            internal.generateUploadUrl.finishUploadInternal,
            { intentId, uploadResponse, size: blob.size, contentType: "image/png" },
          );

          const newUrlInfo = await ctx.runQuery(
            components.assetManager.assetFsHttp.getVersionPreviewUrl,
            { versionId: versionId as any },
          );

          return newUrlInfo?.url || null;
        } catch (error) {
          console.error(
            `[editAvatarWithInstructions] Error generating option ${optionNumber}:`,
            error,
          );
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
        return { success: false, error: "Failed to generate both edited avatar options" };
      }

      const proposalUrls = [url1, url2].filter((u): u is string => u !== null);

      await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
        characterPath,
        state: "ready",
        proposalUrls,
      });

      console.log(
        `[editAvatarWithInstructions] Generated ${proposalUrls.length} edited options for ${characterDisplayName}`,
      );
      return { success: true };
    } catch (error) {
      console.error("[editAvatarWithInstructions] Error:", error);

      await ctx.runMutation(internal.avatarGeneration.updateCharacterAvatarState, {
        characterPath,
        state: "error",
        proposalUrls: undefined,
      });

      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

export const startAvatarEdit = action({
  args: {
    bookPath: v.string(),
    characterSlug: v.string(),
    characterDisplayName: v.string(),
    instructions: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      0,
      (internal as any).avatarEditing.editAvatarWithInstructions,
      args,
    );
    return null;
  },
});
