import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { bookAction } from "./functions";
import {
  DOMParser,
  XMLSerializer,
  type Document as XmlDocument,
  type Element as XmlElement,
  type Node as XmlNode,
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
    Ą: "a",
    Ć: "c",
    Ę: "e",
    Ł: "l",
    Ń: "n",
    Ó: "o",
    Ś: "s",
    Ź: "z",
    Ż: "z",
  };
  let slug = name
    .toLowerCase()
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (char) => polishMap[char] || char)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!/^[a-z]/.test(slug)) {
    slug = "c-" + slug;
  }
  return slug || "character";
}

type ChapterExtra = { chapterNumber?: number; title?: string };

function findParagraphByIndex(doc: XmlDocument, index: number): XmlElement | null {
  const sections = doc.getElementsByTagName("section");
  if (sections.length === 0) return null;

  const section = sections[0];
  let elementIndex = 0;

  for (let i = 0; i < section.childNodes.length; i++) {
    const node = section.childNodes[i];
    if (node.nodeType === 1) {
      if (elementIndex === index) {
        return node as XmlElement;
      }
      elementIndex++;
    }
  }
  return null;
}

function findSpanByDataC(parent: XmlElement, slug: string, text: string): XmlElement | null {
  const spans = parent.getElementsByTagName("span");
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span.getAttribute("data-c") === slug && (span.textContent || "").trim() === text.trim()) {
      return span;
    }
  }
  return null;
}

function findTextNode(
  parent: XmlElement,
  searchText: string,
  occurrenceIndex: number,
): { node: XmlNode; offset: number } | null {
  let currentOccurrence = 0;

  function walk(node: XmlNode): { node: XmlNode; offset: number } | null {
    if (node.nodeType === 3) {
      const text = node.nodeValue || "";
      let searchStart = 0;
      while (true) {
        const idx = text.indexOf(searchText, searchStart);
        if (idx === -1) break;
        if (currentOccurrence === occurrenceIndex) {
          return { node, offset: idx };
        }
        currentOccurrence++;
        searchStart = idx + 1;
      }
    } else if (node.nodeType === 1) {
      for (let i = 0; i < node.childNodes.length; i++) {
        const result = walk(node.childNodes[i]);
        if (result) return result;
      }
    }
    return null;
  }

  return walk(parent);
}

// eslint-disable-next-line max-params -- internal upload helper with contextual parameters
async function uploadAndPublishContent(
  ctx: ActionCtx,
  folderPath: string,
  basename: string,
  content: string,
  contentType: string,
  label: string,
  extra: ChapterExtra,
): Promise<{ versionId: string }> {
  console.log("[upload] to:", folderPath, basename, "length:", content.length);

  const uploadIntent = await ctx.runMutation(internal.generateUploadUrl.startUploadInternal, {
    folderPath,
    basename,
    filename: basename,
    publish: true,
    label,
    extra,
  });

  console.log("[upload] intent:", uploadIntent.intentId, "backend:", uploadIntent.backend);

  const encoded = new TextEncoder().encode(content);
  const response = await fetch(uploadIntent.uploadUrl, {
    method: uploadIntent.backend === "r2" ? "PUT" : "POST",
    headers: { "Content-Type": contentType },
    body: encoded,
  });

  console.log("[upload] response:", response.status);

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  const uploadResponse = uploadIntent.backend === "convex" ? await response.json() : undefined;

  const finishResult = await ctx.runMutation(internal.generateUploadUrl.finishUploadInternal, {
    intentId: uploadIntent.intentId,
    uploadResponse,
    size: encoded.byteLength,
    contentType,
  });

  console.log("[upload] done, versionId:", finishResult.versionId);
  return { versionId: finishResult.versionId };
}

export const setParagraphSpeaker = bookAction({
  args: {
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
  handler: async (ctx, { chapterNumber, paragraphIndex, characterSlug }) => {
    const bookPath = ctx.bookPath;
    const chaptersPath = `${bookPath}/chapters-source`;
    const chapterBasename = `chapter-${chapterNumber}.html`;

    console.log(
      "[setParagraphSpeaker] path:",
      chaptersPath,
      chapterBasename,
      "index:",
      paragraphIndex,
    );

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

    const htmlResult = await ctx.runAction(components.assetManager.assetFsHttp.getTextContent, {
      versionId: publishedVersion._id,
    });

    if (!htmlResult?.content) {
      throw new Error(`Failed to fetch HTML content for ${chapterBasename}`);
    }

    console.log("[setParagraphSpeaker] HTML length:", htmlResult.content.length);

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlResult.content, "text/xml");

    const paragraph = findParagraphByIndex(doc, paragraphIndex);
    console.log(
      "[setParagraphSpeaker] found paragraph:",
      !!paragraph,
      "tagName:",
      paragraph?.tagName,
    );

    if (!paragraph) {
      throw new Error(`Paragraph at index ${paragraphIndex} not found`);
    }

    console.log("[setParagraphSpeaker] before:", paragraph.getAttribute("data-speaker"));

    if (characterSlug) {
      paragraph.setAttribute("data-speaker", characterSlug);
    } else {
      paragraph.removeAttribute("data-speaker");
    }

    console.log("[setParagraphSpeaker] after:", paragraph.getAttribute("data-speaker"));

    const serializer = new XMLSerializer();
    const modifiedHtml = serializer.serializeToString(doc);

    console.log("[setParagraphSpeaker] modified length:", modifiedHtml.length);

    const versionExtra = (publishedVersion?.extra ?? {}) as ChapterExtra;
    const label = characterSlug ? `Set speaker: ${characterSlug}` : "Removed speaker";

    const uploadResult = await uploadAndPublishContent(
      ctx,
      chaptersPath,
      chapterBasename,
      modifiedHtml,
      "text/html",
      label,
      versionExtra,
    );

    return {
      success: true,
      versionId: uploadResult.versionId,
      action: characterSlug ? ("set" as const) : ("removed" as const),
      characterSlug: characterSlug || null,
    };
  },
});

export const modifyCharacterTag = bookAction({
  args: {
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
    { chapterNumber, paragraphIndex, currentCharacterSlug, textContent, newCharacterSlug },
  ) => {
    const bookPath = ctx.bookPath;
    const chaptersPath = `${bookPath}/chapters-source`;
    const chapterBasename = `chapter-${chapterNumber}.html`;

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

    const htmlResult = await ctx.runAction(components.assetManager.assetFsHttp.getTextContent, {
      versionId: publishedVersion._id,
    });

    if (!htmlResult?.content) {
      throw new Error(`Failed to fetch HTML content for ${chapterBasename}`);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlResult.content, "text/xml");

    const paragraph = findParagraphByIndex(doc, paragraphIndex);
    if (!paragraph) {
      throw new Error(`Paragraph at index ${paragraphIndex} not found`);
    }

    const charSpan = findSpanByDataC(paragraph, currentCharacterSlug, textContent);
    if (!charSpan) {
      throw new Error(`Character "${currentCharacterSlug}" with text "${textContent}" not found`);
    }

    if (newCharacterSlug) {
      charSpan.setAttribute("data-c", newCharacterSlug);
    } else {
      const parent = charSpan.parentNode;
      if (parent) {
        const textNode = doc.createTextNode(textContent);
        parent.replaceChild(textNode, charSpan);
      }
    }

    const serializer = new XMLSerializer();
    const modifiedHtml = serializer.serializeToString(doc);

    const versionExtra = (publishedVersion?.extra ?? {}) as ChapterExtra;
    const label = newCharacterSlug
      ? `Changed character: ${currentCharacterSlug} → ${newCharacterSlug}`
      : `Removed character tag: ${currentCharacterSlug}`;

    const uploadResult = await uploadAndPublishContent(
      ctx,
      chaptersPath,
      chapterBasename,
      modifiedHtml,
      "text/html",
      label,
      versionExtra,
    );

    return {
      success: true,
      versionId: uploadResult.versionId,
      action: newCharacterSlug ? ("changed" as const) : ("removed" as const),
      newCharacterSlug: newCharacterSlug || null,
    };
  },
});

export const wrapTextWithCharacter = bookAction({
  args: {
    chapterNumber: v.number(),
    paragraphIndex: v.number(),
    textToWrap: v.string(),
    occurrenceIndex: v.number(),
    characterSlug: v.string(),
  },
  returns: v.object({ success: v.boolean(), versionId: v.string(), characterSlug: v.string() }),
  handler: async (
    ctx,
    { chapterNumber, paragraphIndex, textToWrap, occurrenceIndex, characterSlug },
  ) => {
    const bookPath = ctx.bookPath;
    const chaptersPath = `${bookPath}/chapters-source`;
    const chapterBasename = `chapter-${chapterNumber}.html`;

    console.log(
      "[wrapText] looking for:",
      textToWrap,
      "occurrence:",
      occurrenceIndex,
      "in paragraph:",
      paragraphIndex,
    );

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

    const htmlResult = await ctx.runAction(components.assetManager.assetFsHttp.getTextContent, {
      versionId: publishedVersion._id,
    });

    if (!htmlResult?.content) {
      throw new Error(`Failed to fetch HTML content for ${chapterBasename}`);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlResult.content, "text/xml");

    const paragraph = findParagraphByIndex(doc, paragraphIndex);
    if (!paragraph) {
      throw new Error(`Paragraph at index ${paragraphIndex} not found`);
    }

    const textLocation = findTextNode(paragraph, textToWrap, occurrenceIndex);
    if (!textLocation) {
      throw new Error(`Text "${textToWrap}" (occurrence ${occurrenceIndex}) not found`);
    }

    const { node: textNode, offset } = textLocation;
    const originalText = textNode.nodeValue || "";
    const before = originalText.substring(0, offset);
    const after = originalText.substring(offset + textToWrap.length);

    const wrapper = doc.createElement("span");
    wrapper.setAttribute("data-c", characterSlug);
    wrapper.appendChild(doc.createTextNode(textToWrap));

    const parent = textNode.parentNode;
    if (!parent) {
      throw new Error("Cannot wrap text: text node has no parent");
    }
    if (before) parent.insertBefore(doc.createTextNode(before), textNode);
    parent.insertBefore(wrapper, textNode);
    if (after) parent.insertBefore(doc.createTextNode(after), textNode);
    parent.removeChild(textNode);

    const serializer = new XMLSerializer();
    const modifiedHtml = serializer.serializeToString(doc);

    console.log(
      "[wrapText] modified contains data-c?:",
      modifiedHtml.includes(`data-c="${characterSlug}"`),
    );

    const versionExtra = (publishedVersion?.extra ?? {}) as ChapterExtra;
    const label = `Wrapped text with character: ${characterSlug}`;

    const uploadResult = await uploadAndPublishContent(
      ctx,
      chaptersPath,
      chapterBasename,
      modifiedHtml,
      "text/html",
      label,
      versionExtra,
    );

    return { success: true, versionId: uploadResult.versionId, characterSlug };
  },
});

export const removeNoteFromChapter = bookAction({
  args: { chapterNumber: v.number(), noteNumber: v.string() },
  returns: v.object({ success: v.boolean(), versionId: v.string() }),
  handler: async (ctx, { chapterNumber, noteNumber }) => {
    const bookPath = ctx.bookPath;
    const chaptersPath = `${bookPath}/chapters-source`;
    const chapterBasename = `chapter-${chapterNumber}.html`;

    console.log("[removeNote] chapter:", chapterBasename, "noteNumber:", noteNumber);

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

    const htmlResult = await ctx.runAction(components.assetManager.assetFsHttp.getTextContent, {
      versionId: publishedVersion._id,
    });

    if (!htmlResult?.content) {
      throw new Error(`Failed to fetch HTML content for ${chapterBasename}`);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlResult.content, "text/xml");

    let noteFound = false;

    const notes = doc.getElementsByTagName("note");
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      if (note.getAttribute("id") === noteNumber) {
        const parent = note.parentNode;
        if (parent) {
          parent.removeChild(note);
          noteFound = true;
          break;
        }
      }
    }

    if (!noteFound) {
      const anchors = doc.getElementsByTagName("a");
      for (let i = anchors.length - 1; i >= 0; i--) {
        const anchor = anchors[i];
        if (anchor.getAttribute("data-note") === noteNumber) {
          const parent = anchor.parentNode;
          if (parent) {
            parent.removeChild(anchor);
            noteFound = true;
            break;
          }
        }
      }
    }

    if (!noteFound) {
      console.log("[removeNote] content preview:", htmlResult.content.substring(0, 500));
      throw new Error(
        `Note with id "${noteNumber}" not found in chapter (checked <note id> and <a data-note>)`,
      );
    }

    const serializer = new XMLSerializer();
    const modifiedHtml = serializer.serializeToString(doc);

    const versionExtra = (publishedVersion?.extra ?? {}) as ChapterExtra;
    const label = `Removed note: ${noteNumber}`;

    const uploadResult = await uploadAndPublishContent(
      ctx,
      chaptersPath,
      chapterBasename,
      modifiedHtml,
      "text/html",
      label,
      versionExtra,
    );

    return { success: true, versionId: uploadResult.versionId };
  },
});

export const createCharacter = bookAction({
  args: {
    characterName: v.string(),
    chapterNumber: v.optional(v.number()),
    paragraphIndex: v.optional(v.number()),
  },
  returns: v.object({ slug: v.string(), displayName: v.string(), characterPath: v.string() }),
  handler: async (ctx, { characterName, chapterNumber, paragraphIndex }) => {
    const bookPath = ctx.bookPath;
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
