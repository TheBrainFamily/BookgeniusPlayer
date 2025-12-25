import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Element as XmlDomElement, Document as XmlDomDocument } from "@xmldom/xmldom";

type ChapterExtra = { chapterNumber?: number; title?: string };

function findElementByDataIndex(chapter: XmlDomElement, targetIndex: number): XmlDomElement | null {
  const childNodes = chapter.childNodes;
  let currentIndex = 0;

  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];
    if (node.nodeType === 1) {
      if (currentIndex === targetIndex) {
        return node as XmlDomElement;
      }
      currentIndex++;
    }
  }

  return null;
}

function removeExistingTalkingElement(paragraph: XmlDomElement): void {
  const childNodes = paragraph.childNodes;
  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i];
    if (node.nodeType === 1) {
      const element = node as XmlDomElement;
      if (element.getAttribute("talking") === "true") {
        paragraph.removeChild(element);
        return;
      }
    }
  }
}

function insertTalkingElement(
  doc: XmlDomDocument,
  paragraph: XmlDomElement,
  characterSlug: string,
): void {
  removeExistingTalkingElement(paragraph);

  const talkingElement = doc.createElement(characterSlug);
  talkingElement.setAttribute("talking", "true");

  if (paragraph.firstChild) {
    paragraph.insertBefore(talkingElement, paragraph.firstChild);
  } else {
    paragraph.appendChild(talkingElement);
  }
}

async function uploadAndPublishXml(
  ctx: ActionCtx,
  folderPath: string,
  basename: string,
  content: string,
  label: string,
  extra: ChapterExtra,
): Promise<{ versionId: string }> {
  const uploadIntent = await ctx.runMutation(internal.generateUploadUrl.startUploadInternal, {
    folderPath,
    basename,
    filename: basename,
    publish: true,
    label,
    extra,
  });

  const encoded = new TextEncoder().encode(content);
  const response = await fetch(uploadIntent.uploadUrl, {
    method: uploadIntent.backend === "r2" ? "PUT" : "POST",
    headers: { "Content-Type": "application/xml" },
    body: encoded,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  const uploadResponse = uploadIntent.backend === "convex" ? await response.json() : undefined;

  const finishResult = await ctx.runMutation(internal.generateUploadUrl.finishUploadInternal, {
    intentId: uploadIntent.intentId,
    uploadResponse,
    size: encoded.byteLength,
    contentType: "application/xml",
  });

  return { versionId: finishResult.versionId };
}

export const setParagraphSpeaker = action({
  args: {
    bookPath: v.string(),
    chapterNumber: v.number(),
    paragraphIndex: v.number(),
    characterSlug: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    versionId: v.string(),
    action: v.union(v.literal("set"), v.literal("removed")),
    characterSlug: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { bookPath, chapterNumber, paragraphIndex, characterSlug }) => {
    // TODO: Add auth check here when ready
    // import { requireAuth } from "./authHelpers";
    // await requireAuth(ctx);

    const chaptersPath = `${bookPath}/chapters`;
    const chapterBasename = `chapter${chapterNumber}.xml`;

    const asset = await ctx.runQuery(components.assetManager.assetManager.getAsset, {
      folderPath: chaptersPath,
      basename: chapterBasename,
    });

    if (!asset) {
      throw new Error(`Chapter not found: ${chapterBasename}`);
    }

    const versions = await ctx.runQuery(components.assetManager.assetManager.getAssetVersions, {
      folderPath: chaptersPath,
      basename: chapterBasename,
    });

    const publishedVersion = versions.find((v) => v.state === "published");
    if (!publishedVersion) {
      throw new Error(`No published version for chapter: ${chapterBasename}`);
    }

    const xmlResult = await ctx.runAction(components.assetManager.assetFsHttp.getTextContent, {
      versionId: publishedVersion._id,
    });

    if (!xmlResult?.content) {
      throw new Error(`Failed to fetch XML content for ${chapterBasename}`);
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlResult.content, "text/xml");

    const parseError = xmlDoc.getElementsByTagName("parsererror")[0];
    if (parseError) {
      throw new Error(`XML parse error: ${parseError.textContent || "unknown error"}`);
    }

    const chapter = xmlDoc.getElementsByTagName("Chapter")[0] as XmlDomElement;
    if (!chapter) {
      throw new Error("Chapter element not found in XML");
    }

    const paragraph = findElementByDataIndex(chapter, paragraphIndex);
    if (!paragraph) {
      throw new Error(`Paragraph at index ${paragraphIndex} not found`);
    }

    if (characterSlug) {
      insertTalkingElement(xmlDoc, paragraph, characterSlug);
    } else {
      removeExistingTalkingElement(paragraph);
    }

    const serializer = new XMLSerializer();
    const modifiedXml = serializer.serializeToString(xmlDoc);

    const versionExtra = (publishedVersion?.extra ?? {}) as ChapterExtra;
    const label = characterSlug ? `Set speaker: ${characterSlug}` : "Removed speaker";

    const uploadResult = await uploadAndPublishXml(
      ctx,
      chaptersPath,
      chapterBasename,
      modifiedXml,
      label,
      versionExtra,
    );

    await ctx.scheduler.runAfter(0, internal.chapterCompiler.processPublishedChapter, {
      bookPath,
      chapterBasename,
      versionId: uploadResult.versionId,
    });

    const actionType = characterSlug ? ("set" as const) : ("removed" as const);

    return {
      success: true,
      versionId: uploadResult.versionId,
      action: actionType,
      characterSlug: characterSlug || null,
    };
  },
});
