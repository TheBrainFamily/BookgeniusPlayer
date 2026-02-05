import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { promptForSingleUserDescription } from "./prompts/promptForSingleUserDescription";
import { DOMParser } from "@xmldom/xmldom";
import type { Element as XmlDomElement } from "@xmldom/xmldom";

function getTextFromParagraphs(
  chapter: XmlDomElement,
  startIndex: number,
  endIndex: number,
): string {
  const childNodes = chapter.childNodes;
  const texts: string[] = [];
  let currentIndex = 0;

  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];
    if (node.nodeType === 1) {
      if (currentIndex >= startIndex && currentIndex <= endIndex) {
        texts.push((node.textContent || "").trim());
      }
      currentIndex++;
      if (currentIndex > endIndex) break;
    }
  }

  return texts.join("\n\n");
}

const VISUAL_GUIDE_SCHEMA = {
  type: "object",
  required: ["visualGuide"],
  properties: {
    visualGuide: {
      type: "string",
      description:
        "A highly detailed physical description of the character/scene including age, ethnicity, skin tone, facial features, specific attire, and facial expression. Suitable for text-to-image prompting.",
    },
  },
};

export const generateCharacterPrompt = internalAction({
  args: {
    bookPath: v.string(),
    characterSlug: v.string(),
    characterName: v.string(),
    chapterNumber: v.number(),
    paragraphIndex: v.number(),
  },
  returns: v.object({ success: v.boolean(), aiPrompt: v.optional(v.string()) }),

  handler: async (
    ctx,
    { bookPath, characterSlug, characterName, chapterNumber, paragraphIndex },
  ) => {
    try {
      if (process.env.DISABLE_AI === "true") {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const aiPrompt = `A mysterious figure known as ${characterName}. Medium build, weathered features, wearing period-appropriate attire.`;

        await ctx.runMutation(internal.metadata.upsertCharacterMetadataInternal, {
          bookPath,
          characterSlug,
          aiPrompt,
        });

        console.log(`[generateCharacterPrompt] DISABLE_AI: Using mock prompt for ${characterName}`);
        return { success: true, aiPrompt };
      }

      const chaptersPath = `${bookPath}/chapters-source`;
      const chapterBasename = `chapter-${chapterNumber}.html`;

      const versions = await ctx.runQuery(
        components.versionedAssets.assetManager.getAssetVersions,
        { folderPath: chaptersPath, basename: chapterBasename },
      );

      const publishedVersion = versions.find((v) => v.state === "published");
      if (!publishedVersion) {
        console.error(
          `[generateCharacterPrompt] No published version for chapter: ${chapterBasename}`,
        );
        return { success: false };
      }

      const xmlResult = await ctx.runAction(components.versionedAssets.assetFsHttp.getTextContent, {
        versionId: publishedVersion._id,
      });

      if (!xmlResult?.content) {
        console.error(
          `[generateCharacterPrompt] Failed to fetch HTML content for ${chapterBasename}`,
        );
        return { success: false };
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlResult.content, "text/html");

      const section = doc.getElementsByTagName("section")[0] as XmlDomElement;
      if (!section) {
        console.error("[generateCharacterPrompt] Section element not found in HTML");
        return { success: false };
      }

      const startIndex = Math.max(0, paragraphIndex - 10);
      const endIndex = paragraphIndex + 10;
      const bookContext = getTextFromParagraphs(section, startIndex, endIndex);

      if (!bookContext.trim()) {
        console.error("[generateCharacterPrompt] No context extracted from paragraphs");
        return { success: false };
      }

      const bookSlug = bookPath.split("/").pop() || bookPath;
      const prompt = promptForSingleUserDescription(bookSlug, characterName, bookContext);

      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) {
        console.error(
          "[generateCharacterPrompt] GOOGLE_GENERATIVE_AI_API_KEY environment variable not set",
        );
        return { success: false };
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: VISUAL_GUIDE_SCHEMA,
            },
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[generateCharacterPrompt] Gemini API error: ${response.status} - ${errorText}`,
        );
        return { success: false };
      }

      const result = await response.json();

      if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error("[generateCharacterPrompt] No text response from Gemini");
        return { success: false };
      }

      const parsed = JSON.parse(result.candidates[0].content.parts[0].text) as {
        visualGuide: string;
      };
      const aiPrompt = parsed.visualGuide;

      if (!aiPrompt) {
        console.error("[generateCharacterPrompt] No visualGuide in Gemini response");
        return { success: false };
      }

      await ctx.runMutation(internal.metadata.upsertCharacterMetadataInternal, {
        bookPath,
        characterSlug,
        aiPrompt,
      });

      console.log(
        `[generateCharacterPrompt] Generated prompt for ${characterName}: ${aiPrompt.substring(0, 100)}...`,
      );

      // Automatically trigger avatar generation with the generated prompt
      await ctx.scheduler.runAfter(0, internal.avatarGeneration.generateAvatarOptions, {
        bookPath,
        characterSlug,
        characterDisplayName: characterName,
        visualPrompt: aiPrompt,
      });

      console.log(`[generateCharacterPrompt] Scheduled avatar generation for ${characterName}`);

      return { success: true, aiPrompt };
    } catch (error) {
      console.error("[generateCharacterPrompt] Error:", error);
      return { success: false };
    }
  },
});
