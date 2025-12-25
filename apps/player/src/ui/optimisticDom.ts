/**
 * Optimistic DOM manipulation utilities for in-player editing.
 * These modify the DOM immediately before server confirmation,
 * providing instant feedback. The server response will overwrite these changes.
 */

type RevertFunction = () => void;

function findParagraphElement(chapterNumber: number, paragraphIndex: number): HTMLElement | null {
  const section = document.querySelector<HTMLElement>(`section[data-chapter="${chapterNumber}"]`);
  if (!section) return null;

  return section.querySelector<HTMLElement>(`[data-index="${paragraphIndex}"]`);
}

function findTextNodeWithOccurrence(container: Node, searchText: string, occurrenceIndex: number): { textNode: Text; startOffset: number } | null {
  let currentOccurrence = 0;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
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
  }

  return null;
}

export function optimisticWrapTextWithCharacter(
  chapterNumber: number,
  paragraphIndex: number,
  textToWrap: string,
  occurrenceIndex: number,
  characterSlug: string,
): RevertFunction | null {
  const paragraph = findParagraphElement(chapterNumber, paragraphIndex);
  if (!paragraph) {
    console.warn("[optimisticDom] Paragraph not found:", chapterNumber, paragraphIndex);
    return null;
  }

  const textLocation = findTextNodeWithOccurrence(paragraph, textToWrap, occurrenceIndex);
  if (!textLocation) {
    console.warn("[optimisticDom] Text occurrence not found:", textToWrap, occurrenceIndex);
    return null;
  }

  const { textNode, startOffset } = textLocation;
  const parent = textNode.parentNode;
  if (!parent) return null;

  const originalText = textNode.nodeValue || "";
  const beforeText = originalText.substring(0, startOffset);
  const afterText = originalText.substring(startOffset + textToWrap.length);

  const wrapperSpan = document.createElement("span");
  wrapperSpan.className = "character-highlighted";
  wrapperSpan.dataset.character = characterSlug;
  wrapperSpan.dataset.optimistic = "true";
  wrapperSpan.textContent = textToWrap;

  const beforeNode = beforeText ? document.createTextNode(beforeText) : null;
  const afterNode = afterText ? document.createTextNode(afterText) : null;

  if (beforeNode) parent.insertBefore(beforeNode, textNode);
  parent.insertBefore(wrapperSpan, textNode);
  if (afterNode) parent.insertBefore(afterNode, textNode);
  parent.removeChild(textNode);

  return () => {
    if (beforeNode) parent.removeChild(beforeNode);
    if (afterNode) parent.removeChild(afterNode);
    parent.insertBefore(textNode, wrapperSpan);
    parent.removeChild(wrapperSpan);
  };
}

export function optimisticModifyCharacterTag(
  chapterNumber: number,
  paragraphIndex: number,
  currentCharacterSlug: string,
  textContent: string,
  newCharacterSlug: string | undefined,
): RevertFunction | null {
  const paragraph = findParagraphElement(chapterNumber, paragraphIndex);
  if (!paragraph) return null;

  const characterSpan = Array.from(paragraph.querySelectorAll<HTMLElement>(`[data-character="${currentCharacterSlug}"]`)).find(
    (el) => el.textContent?.trim() === textContent.trim(),
  );

  if (!characterSpan) {
    console.warn("[optimisticDom] Character span not found");
    return null;
  }

  const originalSlug = characterSpan.dataset.character;

  if (newCharacterSlug) {
    characterSpan.dataset.character = newCharacterSlug;
    characterSpan.dataset.optimistic = "true";

    return () => {
      characterSpan.dataset.character = originalSlug;
      delete characterSpan.dataset.optimistic;
    };
  } else {
    const parent = characterSpan.parentNode;
    if (!parent) return null;

    const textNode = document.createTextNode(textContent);
    parent.insertBefore(textNode, characterSpan);
    parent.removeChild(characterSpan);

    return () => {
      parent.insertBefore(characterSpan, textNode);
      parent.removeChild(textNode);
    };
  }
}

export function optimisticSetTalkingCharacter(chapterNumber: number, paragraphIndex: number, characterSlug: string | undefined, avatarUrl?: string): RevertFunction | null {
  const paragraph = findParagraphElement(chapterNumber, paragraphIndex);
  if (!paragraph) return null;

  const existingTalking = paragraph.querySelector<HTMLElement>('[data-is-talking="true"]');
  const originalSlug = existingTalking?.dataset.character;

  if (characterSlug) {
    if (existingTalking) {
      const inlineAvatar = existingTalking.querySelector<HTMLElement>(".inline-avatar");
      const originalAvatarUrl = inlineAvatar?.querySelector<HTMLImageElement>("img")?.src;

      existingTalking.dataset.character = characterSlug;
      existingTalking.dataset.optimistic = "true";

      if (inlineAvatar && avatarUrl) {
        inlineAvatar.dataset.character = characterSlug;
        const img = inlineAvatar.querySelector<HTMLImageElement>("img");
        if (img) img.src = avatarUrl;
      }

      return () => {
        if (originalSlug) existingTalking.dataset.character = originalSlug;
        delete existingTalking.dataset.optimistic;
        if (inlineAvatar && originalSlug) {
          inlineAvatar.dataset.character = originalSlug;
          const img = inlineAvatar.querySelector<HTMLImageElement>("img");
          if (img && originalAvatarUrl) img.src = originalAvatarUrl;
        }
      };
    } else {
      const talkingSpan = document.createElement("span");
      talkingSpan.className = "character-placeholder character-talking start-of-paragraph";
      talkingSpan.dataset.character = characterSlug;
      talkingSpan.dataset.isTalking = "true";
      talkingSpan.dataset.optimistic = "true";

      const inlineAvatar = document.createElement("span");
      inlineAvatar.className = "inline-avatar relative w-full h-full";
      inlineAvatar.dataset.character = characterSlug;
      inlineAvatar.title = characterSlug;

      if (avatarUrl) {
        const img = document.createElement("img");
        img.src = avatarUrl;
        img.className = "absolute top-0 left-0 w-full h-full object-cover rounded-full";
        img.alt = characterSlug;
        inlineAvatar.appendChild(img);
      }

      talkingSpan.appendChild(inlineAvatar);
      paragraph.insertBefore(talkingSpan, paragraph.firstChild);

      return () => {
        paragraph.removeChild(talkingSpan);
      };
    }
  } else {
    if (existingTalking) {
      const parent = existingTalking.parentNode;
      if (!parent) return null;

      parent.removeChild(existingTalking);

      return () => {
        paragraph.insertBefore(existingTalking, paragraph.firstChild);
      };
    }
  }

  return null;
}
