import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal, components } from "./_generated/api";
import OpenAI from "openai";

function extractParagraphsAroundPosition(
  html: string,
  targetParagraph: number,
  count: number,
): string[] {
  const paragraphRegex = /<p[^>]*data-paragraph="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs: { num: number; text: string }[] = [];

  let match;
  while ((match = paragraphRegex.exec(html)) !== null) {
    const paragraphNum = parseInt(match[1], 10);
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text) {
      paragraphs.push({ num: paragraphNum, text });
    }
  }

  const startIdx = Math.max(0, targetParagraph - count);
  const endIdx = Math.min(paragraphs.length, targetParagraph + count + 1);

  return paragraphs.filter((p) => p.num >= startIdx && p.num <= endIdx).map((p) => p.text);
}

export const editBackgroundWithInstructions = internalAction({
  args: {
    bookPath: v.string(),
    cueId: v.id("backgroundCues"),
    fileBasename: v.string(),
    instructions: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    newFileBasename: v.optional(v.string()),
  }),
  handler: async (ctx, { bookPath, cueId, fileBasename, instructions }) => {
    console.log("[editBackgroundWithInstructions] Starting", {
      bookPath,
      cueId,
      fileBasename,
      instructionsLength: instructions.length,
    });

    try {
      const backgroundsPath = `${bookPath}/backgrounds`;

      const versions = await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
        folderPath: backgroundsPath,
        basename: fileBasename,
      });

      const publishedVersion = versions.find((ver) => ver.state === "published");
      if (!publishedVersion) {
        return { success: false, error: `No published version found for ${fileBasename}` };
      }

      const urlInfo = await ctx.runQuery(components.assetManager.assetFsHttp.getVersionPreviewUrl, {
        versionId: publishedVersion._id,
      });

      if (!urlInfo?.url) {
        return { success: false, error: "Failed to get background URL" };
      }

      const imageResponse = await fetch(urlInfo.url);
      if (!imageResponse.ok) {
        return { success: false, error: "Failed to fetch current background" };
      }

      const imageBuffer = await imageResponse.arrayBuffer();

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return { success: false, error: "OPENAI_API_KEY not configured" };
      }

      const openai = new OpenAI({ apiKey });

      const bookFolder = await ctx.runQuery(components.assetManager.assetManager.getFolder, {
        path: bookPath,
      });
      const bookExtra = (bookFolder?.extra as Record<string, unknown>) || {};
      const backgroundStyle = (bookExtra.backgroundStyle as string) || "";

      const editPrompt = backgroundStyle ? `${backgroundStyle}\n${instructions}` : instructions;

      const result = await openai.images.edit({
        model: "gpt-image-1.5",
        image: new File([imageBuffer], fileBasename, { type: "image/png" }),
        prompt: editPrompt,
        size: "1536x1024",
        output_format: "webp",
        quality: "medium",
      });

      const imageBase64 = result.data?.[0]?.b64_json;
      if (!imageBase64) {
        return { success: false, error: "No image data returned from OpenAI" };
      }

      const binaryData = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([binaryData], { type: "image/webp" });

      const timestamp = Date.now();
      const baseName = fileBasename.replace(/\.[^.]+$/, "");
      const newBasename = `${baseName}-edited-${timestamp}.webp`;

      console.log("[editBackgroundWithInstructions] OpenAI edit complete, uploading result", {
        newBasename,
      });

      const uploadIntent: { intentId: string; uploadUrl: string; backend: "r2" | "convex" } =
        await ctx.runMutation(internal.generateUploadUrl.startUploadInternal, {
          folderPath: backgroundsPath,
          basename: newBasename,
          publish: true,
        });

      const uploadRes: Response = await fetch(uploadIntent.uploadUrl, {
        method: uploadIntent.backend === "r2" ? "PUT" : "POST",
        body: blob,
        headers: { "Content-Type": "image/webp" },
      });

      if (!uploadRes.ok) {
        return { success: false, error: `Upload failed: ${uploadRes.status}` };
      }

      const uploadResponse = uploadIntent.backend === "convex" ? await uploadRes.json() : undefined;

      await ctx.runMutation(internal.generateUploadUrl.finishUploadInternal, {
        intentId: uploadIntent.intentId,
        uploadResponse,
        size: blob.size,
        contentType: "image/webp",
      });

      await ctx.runMutation(internal.backgroundCues.updateFileInternal, {
        id: cueId,
        fileBasename: newBasename,
      });

      console.log("[editBackgroundWithInstructions] SUCCESS", { newBasename });
      return { success: true, newFileBasename: newBasename };
    } catch (error) {
      console.error("[editBackgroundWithInstructions] Error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

export const generateNewBackground = internalAction({
  args: { bookPath: v.string(), chapter: v.number(), paragraph: v.number(), prompt: v.string() },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    cueId: v.optional(v.string()),
  }),
  handler: async (ctx, { bookPath, chapter, paragraph, prompt }) => {
    console.log("[generateNewBackground] Starting", {
      bookPath,
      chapter,
      paragraph,
      promptLength: prompt.length,
    });

    try {
      const chaptersSource = await ctx.runQuery(
        components.assetManager.assetManager.listPublishedFilesInFolder,
        { folderPath: `${bookPath}/chapters-source` },
      );

      let contextText = "";

      const currentChapterFile = chaptersSource.find(
        (f) => f.basename === `chapter-${chapter}.html`,
      );
      if (currentChapterFile?.url) {
        try {
          const response = await fetch(currentChapterFile.url);
          if (response.ok) {
            const html = await response.text();
            const paragraphs = extractParagraphsAroundPosition(html, paragraph, 3);
            contextText = paragraphs.join("\n\n");
          }
        } catch (e) {
          console.warn("[generateNewBackground] Failed to fetch chapter content:", e);
        }
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return { success: false, error: "OPENAI_API_KEY not configured" };
      }

      const openai = new OpenAI({ apiKey });

      const bookFolder = await ctx.runQuery(components.assetManager.assetManager.getFolder, {
        path: bookPath,
      });
      const bookExtra = (bookFolder?.extra as Record<string, unknown>) || {};
      const backgroundStyle = (bookExtra.backgroundStyle as string) || "";

      let fullPrompt = prompt;
      if (contextText) {
        fullPrompt = `Scene context from the book:\n${contextText}\n\nCreate a background image: ${prompt}`;
      }
      if (backgroundStyle) {
        fullPrompt = `${backgroundStyle}\n\n${fullPrompt}`;
      }

      console.log("[generateNewBackground] Calling OpenAI images.generate");

      const result = await openai.images.generate({
        model: "gpt-image-1.5",
        prompt: fullPrompt,
        size: "1536x1024",
        quality: "medium",
        output_format: "webp",
        moderation: "low",
      });

      console.log("[generateNewBackground] OpenAI response received");

      const imageBase64 = result.data?.[0]?.b64_json;
      if (!imageBase64) {
        return { success: false, error: "No image data returned from OpenAI" };
      }

      const binaryData = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([binaryData], { type: "image/webp" });

      const timestamp = Date.now();
      const slugifiedPrompt = prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 30);
      const newBasename = `bg-ch${chapter}-p${paragraph}-${slugifiedPrompt}-${timestamp}.webp`;

      const backgroundsPath = `${bookPath}/backgrounds`;

      const uploadIntent2: { intentId: string; uploadUrl: string; backend: "r2" | "convex" } =
        await ctx.runMutation(internal.generateUploadUrl.startUploadInternal, {
          folderPath: backgroundsPath,
          basename: newBasename,
          publish: true,
        });

      const uploadRes2: Response = await fetch(uploadIntent2.uploadUrl, {
        method: uploadIntent2.backend === "r2" ? "PUT" : "POST",
        body: blob,
        headers: { "Content-Type": "image/webp" },
      });

      if (!uploadRes2.ok) {
        return { success: false, error: `Upload failed: ${uploadRes2.status}` };
      }

      const uploadResponse2 =
        uploadIntent2.backend === "convex" ? await uploadRes2.json() : undefined;

      await ctx.runMutation(internal.generateUploadUrl.finishUploadInternal, {
        intentId: uploadIntent2.intentId,
        uploadResponse: uploadResponse2,
        size: blob.size,
        contentType: "image/webp",
      });

      console.log("[generateNewBackground] Upload complete, creating cue", { newBasename });

      const newCueId: string = await ctx.runMutation(internal.backgroundCues.createInternal, {
        bookPath,
        fileBasename: newBasename,
        chapter,
        paragraph,
      });

      console.log("[generateNewBackground] SUCCESS", { newCueId, newBasename });
      return { success: true, cueId: newCueId };
    } catch (error) {
      console.error("[generateNewBackground] Error:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});
