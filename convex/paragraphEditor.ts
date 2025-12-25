import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type {
  Element as XmlDomElement,
  Document as XmlDomDocument,
  Node as XmlDomNode,
} from "@xmldom/xmldom";

function slugify(name: string): string {
  const polishMap: { [key: string]: string } = {
    ą: "a",
    ć: "c",
    ę: "e",
    ł: "l",
    ń: "n",
    ó: "o",
    ś: "s",
    ź: "z",
    ż: "z",
    Ą: "A",
    Ć: "C",
    Ę: "E",
    Ł: "L",
    Ń: "N",
    Ó: "O",
    Ś: "S",
    Ź: "Z",
    Ż: "Z",
  };
  let tagName = name
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (char) => polishMap[char] || char)
    .replace(/[,()]/g, "")
    .replace(/\s+/g, "-")
    .trim();
  tagName = tagName.replace(/[^a-zA-Z0-9\-_.:]/g, "");
  if (!/^[a-zA-Z_]/.test(tagName)) {
    tagName = "_" + tagName;
  }
  return tagName || "Character";
}

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

function findCharacterElement(
  paragraph: XmlDomElement,
  characterSlug: string,
  textContent: string,
): XmlDomElement | null {
  const queue: XmlDomNode[] = [paragraph];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.nodeType === 1) {
      const element = node as XmlDomElement;
      if (
        element.tagName.toLowerCase() === characterSlug.toLowerCase() &&
        (element.textContent || "").trim() === textContent.trim()
      ) {
        return element;
      }
      for (let i = 0; i < element.childNodes.length; i++) {
        queue.push(element.childNodes[i]);
      }
    }
  }

  return null;
}

function replaceCharacterTag(
  doc: XmlDomDocument,
  oldElement: XmlDomElement,
  newCharacterSlug: string,
): void {
  const newElement = doc.createElement(newCharacterSlug);

  for (let i = 0; i < oldElement.attributes.length; i++) {
    const attr = oldElement.attributes[i];
    newElement.setAttribute(attr.name, attr.value);
  }

  while (oldElement.firstChild) {
    newElement.appendChild(oldElement.firstChild);
  }

  oldElement.parentNode?.replaceChild(newElement, oldElement);
}

function removeCharacterTag(oldElement: XmlDomElement): void {
  const parent = oldElement.parentNode;
  if (!parent) return;

  while (oldElement.firstChild) {
    parent.insertBefore(oldElement.firstChild, oldElement);
  }
  parent.removeChild(oldElement);
}

function findTextNodeWithOccurrence(
  paragraph: XmlDomElement,
  searchText: string,
  occurrenceIndex: number,
): { textNode: XmlDomNode; startOffset: number } | null {
  let currentOccurrence = 0;
  let accumulatedText = "";

  const walkTextNodes = (
    node: XmlDomNode,
  ): { textNode: XmlDomNode; startOffset: number } | null => {
    if (node.nodeType === 3) {
      const textContent = node.nodeValue || "";
      let searchStart = 0;

      while (true) {
        const localIndex = textContent.indexOf(searchText, searchStart);
        if (localIndex === -1) break;

        if (currentOccurrence === occurrenceIndex) {
          return { textNode: node, startOffset: localIndex };
        }
        currentOccurrence++;
        searchStart = localIndex + 1;
      }
      accumulatedText += textContent;
    } else if (node.nodeType === 1) {
      for (let i = 0; i < node.childNodes.length; i++) {
        const result = walkTextNodes(node.childNodes[i]);
        if (result) return result;
      }
    }
    return null;
  };

  return walkTextNodes(paragraph);
}

function wrapTextInNode(
  doc: XmlDomDocument,
  textNode: XmlDomNode,
  startOffset: number,
  textToWrap: string,
  characterSlug: string,
): void {
  const parent = textNode.parentNode;
  if (!parent) return;

  const originalText = textNode.nodeValue || "";
  const beforeText = originalText.substring(0, startOffset);
  const afterText = originalText.substring(startOffset + textToWrap.length);

  const wrapperElement = doc.createElement(characterSlug);
  wrapperElement.appendChild(doc.createTextNode(textToWrap));

  if (beforeText) {
    parent.insertBefore(doc.createTextNode(beforeText), textNode);
  }
  parent.insertBefore(wrapperElement, textNode);
  if (afterText) {
    parent.insertBefore(doc.createTextNode(afterText), textNode);
  }
  parent.removeChild(textNode);
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

export const modifyCharacterTag = action({
  args: {
    bookPath: v.string(),
    chapterNumber: v.number(),
    paragraphIndex: v.number(),
    currentCharacterSlug: v.string(),
    textContent: v.string(),
    newCharacterSlug: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    versionId: v.string(),
    action: v.union(v.literal("changed"), v.literal("removed")),
    newCharacterSlug: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    {
      bookPath,
      chapterNumber,
      paragraphIndex,
      currentCharacterSlug,
      textContent,
      newCharacterSlug,
    },
  ) => {
    // TODO: Add auth check here when ready

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

    const characterElement = findCharacterElement(paragraph, currentCharacterSlug, textContent);
    if (!characterElement) {
      throw new Error(
        `Character element "${currentCharacterSlug}" with text "${textContent}" not found in paragraph`,
      );
    }

    if (newCharacterSlug) {
      replaceCharacterTag(xmlDoc, characterElement, newCharacterSlug);
    } else {
      removeCharacterTag(characterElement);
    }

    const serializer = new XMLSerializer();
    const modifiedXml = serializer.serializeToString(xmlDoc);

    const versionExtra = (publishedVersion?.extra ?? {}) as ChapterExtra;
    const label = newCharacterSlug
      ? `Changed character: ${currentCharacterSlug} → ${newCharacterSlug}`
      : `Removed character tag: ${currentCharacterSlug}`;

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

    const actionType = newCharacterSlug ? ("changed" as const) : ("removed" as const);

    return {
      success: true,
      versionId: uploadResult.versionId,
      action: actionType,
      newCharacterSlug: newCharacterSlug || null,
    };
  },
});

export const wrapTextWithCharacter = action({
  args: {
    bookPath: v.string(),
    chapterNumber: v.number(),
    paragraphIndex: v.number(),
    textToWrap: v.string(),
    occurrenceIndex: v.number(),
    characterSlug: v.string(),
  },
  returns: v.object({ success: v.boolean(), versionId: v.string(), characterSlug: v.string() }),
  handler: async (
    ctx,
    { bookPath, chapterNumber, paragraphIndex, textToWrap, occurrenceIndex, characterSlug },
  ) => {
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

    const textLocation = findTextNodeWithOccurrence(paragraph, textToWrap, occurrenceIndex);
    if (!textLocation) {
      throw new Error(
        `Text "${textToWrap}" (occurrence ${occurrenceIndex}) not found in paragraph`,
      );
    }

    wrapTextInNode(
      xmlDoc,
      textLocation.textNode,
      textLocation.startOffset,
      textToWrap,
      characterSlug,
    );

    const serializer = new XMLSerializer();
    const modifiedXml = serializer.serializeToString(xmlDoc);

    const versionExtra = (publishedVersion?.extra ?? {}) as ChapterExtra;
    const label = `Wrapped text with character: ${characterSlug}`;

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

    return { success: true, versionId: uploadResult.versionId, characterSlug };
  },
});

export const createCharacter = action({
  args: {
    bookPath: v.string(),
    characterName: v.string(),
    chapterNumber: v.optional(v.number()),
    paragraphIndex: v.optional(v.number()),
  },
  returns: v.object({ slug: v.string(), displayName: v.string(), characterPath: v.string() }),
  handler: async (ctx, { bookPath, characterName, chapterNumber, paragraphIndex }) => {
    const displayName = characterName.trim();
    if (!displayName) {
      throw new Error("Character name is required");
    }

    const slug = slugify(displayName);
    if (!slug) {
      throw new Error("Could not generate valid slug from character name");
    }

    const characterPath = `${bookPath}/characters/${slug}`;

    try {
      await ctx.runMutation(components.assetManager.assetManager.createFolderByPath, {
        path: characterPath,
        name: displayName,
        extra: { type: "character", displayName, summary: "" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Folder already exists")) {
        throw new Error(`Character "${displayName}" already exists`);
      }
      throw error;
    }

    if (chapterNumber !== undefined && paragraphIndex !== undefined) {
      await ctx.scheduler.runAfter(0, internal.characterPromptGeneration.generateCharacterPrompt, {
        bookPath,
        characterSlug: slug,
        characterName: displayName,
        chapterNumber,
        paragraphIndex,
      });
    }

    return { slug, displayName, characterPath };
  },
});
