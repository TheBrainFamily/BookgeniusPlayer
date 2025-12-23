import { DOMParser, Element as XMLElement, Document, Element, Node, XMLSerializer, LiveNodeList } from "@xmldom/xmldom";

import { wrapPunctuationAdvanced } from "../../../player/src/services/wrapPunctuation";

const LINE_BREAK_SPAN = '<span style="display:block; height:0; margin:0; padding:0; line-height:1.2em;"></span>';

const renderLineBreakSpan = () => LINE_BREAK_SPAN;

const nodeTypeOf = (node: unknown): number | null =>
  node && typeof (node as { nodeType?: unknown }).nodeType === "number" ? ((node as { nodeType: number }).nodeType ?? null) : null;

const isElementNode = (node: unknown): node is Element => nodeTypeOf(node) === 1;
const isTextNode = (node: unknown): node is Node & { textContent: string | null } => nodeTypeOf(node) === 3;
const startsWithUppercase = (value: string): boolean => value.charAt(0) === value.charAt(0).toUpperCase();

const renderEmElement = (element: Element): string => {
  let emInner = "";
  for (const emChild of Array.from(element.childNodes) as Node[]) {
    if (isTextNode(emChild)) {
      emInner += emChild.textContent || "";
    } else if (isElementNode(emChild)) {
      const emElement = emChild as Element;
      if (emElement.tagName === "LineBreak") {
        emInner += renderLineBreakSpan();
      } else {
        emInner += emElement.textContent || "";
      }
    }
  }
  if (element.hasAttribute("class")) {
    return `<em class="${element.getAttribute("class")}">${emInner}</em>`;
  }
  return `<em>${emInner}</em>`;
};

type InlineRenderOptions = { bookSlug: string; includeBookSlugInImgSrc?: boolean };

const renderStandardInlineElement = (element: Element, options: InlineRenderOptions): string => {
  switch (element.tagName) {
    case "note":
      if (options.bookSlug === "Lalka") {
        return `<a href="#fn${element.getAttribute("id")}" class="link-note">${element.textContent || element.getAttribute("id")}</a>`;
      } else {
        return "";
      }
    case "b":
      return `<span class="bold">${element.textContent || ""}</span>`;
    case "i":
      return `<span class="italic">${element.textContent || ""}</span>`;
    case "strong":
      return `<strong>${(element.textContent || "").trim()}</strong>`;
    case "em":
      return renderEmElement(element);
    case "img": {
      const src = element.getAttribute("src") || "";
      const resolvedSrc = options.includeBookSlugInImgSrc ? `/books/${options.bookSlug}${src}` : src;
      return `<img src="${resolvedSrc}" />`;
    }
    default: {
      const eid = element.getAttribute("id");
      const idStr = eid ? ` id="${eid}"` : "";
      return `<${element.tagName}${idStr}>${element.textContent || ""}</${element.tagName}>`;
    }
  }
};

type CharacterRenderOptions = { isAtParagraphStart: boolean };

type CharacterRenderResult = { html: string; isTalking: boolean; slug: string };

const renderCharacterElement = (element: Element, characterMap: Map<string, { display: string }>, options: CharacterRenderOptions): CharacterRenderResult => {
  const slug = element.tagName;
  const isTalking = element.getAttribute("talking") === "true";

  if (isTalking) {
    const startOfParagraphClass = options.isAtParagraphStart ? " start-of-paragraph" : "";
    const spokenText = element.textContent || "";
    return {
      html: `<span class="character-placeholder character-talking${startOfParagraphClass}" data-character="${slug}" data-is-talking="true"></span>${spokenText ? `<strong>${spokenText}</strong>` : ""}`,
      isTalking: true,
      slug,
    };
  }

  if (element.getAttribute("dynasty") === "true") {
    return { html: element.textContent || "", isTalking: false, slug };
  }

  const charInfo = characterMap.get(slug);
  const displayText = element.textContent || (charInfo?.display ?? slug);

  return { html: `<span class="character-highlighted" data-character="${slug}">${displayText}</span>`, isTalking: false, slug };
};

type ParagraphRenderContext = { characterMap: Map<string, { display: string }>; isLikelyCharacterTag: (tag: string) => boolean; bookSlug: string };

type ParagraphRenderResult = { content: string; hasTalkingCharacter: boolean };

const renderParagraphContent = (paragraph: Element, context: ParagraphRenderContext): ParagraphRenderResult => {
  let hasSignificantTextContent = false;
  let hasTalkingCharacter = false;

  const appendCharacterHtml = (element: Element): string => {
    const result = renderCharacterElement(element, context.characterMap, { isAtParagraphStart: !hasSignificantTextContent });
    if (result.isTalking) {
      hasTalkingCharacter = true;
    }
    return result.html;
  };

  const renderSpanWithId = (spanElement: Element): string => {
    const spanId = spanElement.getAttribute("id");
    if (!spanId) return "";

    let inner = "";
    for (const subNode of Array.from(spanElement.childNodes) as Node[]) {
      if (isTextNode(subNode)) {
        const textContent = subNode.textContent || "";
        if (textContent.trim().length > 0) {
          hasSignificantTextContent = true;
        }
        inner += textContent;
        continue;
      }

      if (isElementNode(subNode)) {
        const subElement = subNode as Element;
        if (subElement.tagName === "LineBreak") {
          inner += renderLineBreakSpan();
          continue;
        }

        const looksLikeCharacter = context.characterMap.has(subElement.tagName) || context.isLikelyCharacterTag(subElement.tagName);
        if (looksLikeCharacter) {
          inner += appendCharacterHtml(subElement);
          continue;
        }

        inner += renderStandardInlineElement(subElement, { bookSlug: context.bookSlug });
      }
    }

    return `<span id="${spanId}">${inner}</span>`;
  };

  let paragraphContent = "";
  for (const node of Array.from(paragraph.childNodes) as Node[]) {
    if (isTextNode(node)) {
      const textContent = node.textContent || "";
      if (textContent.trim().length > 0) {
        hasSignificantTextContent = true;
      }
      paragraphContent += textContent;
      continue;
    }

    if (isElementNode(node)) {
      const element = node as Element;

      if (element.tagName === "span" && element.hasAttribute("id")) {
        paragraphContent += renderSpanWithId(element);
        continue;
      }

      if (element.tagName === "LineBreak") {
        paragraphContent += renderLineBreakSpan();
        continue;
      }

      const looksLikeCharacter = context.characterMap.has(element.tagName) || context.isLikelyCharacterTag(element.tagName);
      if (looksLikeCharacter) {
        paragraphContent += appendCharacterHtml(element);
        continue;
      }

      hasSignificantTextContent = true;
      paragraphContent += renderStandardInlineElement(element, { bookSlug: context.bookSlug, includeBookSlugInImgSrc: true });
    }
  }

  return { content: paragraphContent, hasTalkingCharacter };
};

class PlayRowState {
  private rowOpen = false;
  private didaskaliaRowOpen = false;

  isRowOpen(): boolean {
    return this.rowOpen;
  }

  isDidaskaliaRowOpen(): boolean {
    return this.didaskaliaRowOpen;
  }

  openCharacterRow(alignment: "left" | "right", hasAvatar: boolean, avatarHtml: string): string {
    let result = "";
    if (this.rowOpen) {
      result += this.closeRow();
    }

    const rowClass = hasAvatar ? "" : " didaskalia-row";
    result += `\n <div class="play-row${rowClass}" data-text-alignment="${alignment}">\n`;
    if (hasAvatar) {
      result += `\n  <div class="character-avatar">${avatarHtml}</div>\n`;
    }
    result += `\n  <div class="character-text">\n`;

    this.rowOpen = true;
    this.didaskaliaRowOpen = false;
    return result;
  }

  ensureDidaskaliaRow(): string {
    let result = "";

    if (this.rowOpen && !this.didaskaliaRowOpen) {
      result += this.closeRow();
    }

    if (!this.didaskaliaRowOpen) {
      result += `\n <div class="play-row didaskalia-row">\n`;
      result += `\n  <div class="didaskalia-text">\n`;
      this.rowOpen = true;
      this.didaskaliaRowOpen = true;
    }

    return result;
  }

  closeDidaskaliaRow(): string {
    if (!this.didaskaliaRowOpen) {
      return "";
    }
    return this.closeRow();
  }

  closeRow(): string {
    if (!this.rowOpen) {
      return "";
    }

    //TODO revisit this after we are done with functional refactor - this should be done with formatter tool
    const closing = this.didaskaliaRowOpen ? `\n  </div>\n\n </div>\n` : `\n </div>\n\n </div>\n`;

    this.rowOpen = false;
    this.didaskaliaRowOpen = false;
    return closing;
  }
}

const isLikelyCharacterTag = (tag: string) => {
  const first = tag.charAt(0);
  return first === first.toUpperCase() && /[A-Z]/.test(first);
};

const getTitleText = (el?: Element | null) => (el ? (el.textContent || "").trim() : "");

const extractInnerHTML = (el: Element): string => {
  const serializer = new XMLSerializer();

  let html = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    html += serializer.serializeToString(el.childNodes[i] as Node);
  }
  return html;
};

const normalizeForDidaskaliaCheck = (html: string): string => {
  // remove all <span class="character-placeholder"> tags
  let s = html.replace(/<span class="character-highlighted"[^>]*>([^<]*)<\/span>/g, "$1");
  // remove all tags except <em> and </em>
  s = s.replace(/<(?!em|\/em)[^>]*>/g, "");
  return s;
};

const isDidaskaliaHTML = (html: string): boolean => {
  const s = normalizeForDidaskaliaCheck(html);
  const em = s.match(/<em>.*?<\/em>/gs)?.join("") || "";
  const outside = s.replace(/<em>.*?<\/em>/gs, "").trim();
  return em.length > 0 && (outside.length === 0 || em.length > outside.length * 2);
};

const findFirstTalkingCharacterSlug = (root: Element, characterMap: Map<string, unknown>): string | null => {
  const stack: Node[] = Array.from(root.childNodes);

  while (stack.length) {
    const n = stack.shift()!;
    if (isElementNode(n)) {
      const el = n as Element;
      const tag = el.tagName;
      const looksLikeChar = characterMap.has(tag) || isLikelyCharacterTag(tag);
      if (looksLikeChar && el.getAttribute("talking") === "true") return tag;
      for (let i = 0; i < el.childNodes.length; i++) stack.push(el.childNodes[i]);
    }
  }

  return null;
};

const normalizeParagraphWhitespace = (content: string): string => {
  let clean = content.replace(/\s+/g, " ").trim();
  clean = clean.replace(/\s*(<span class="character-talking"[^>]*><\/span>)\s*/g, "$1");
  return clean;
};

const serializeLowercaseChildren = (element: Element): string => {
  const serializer = new XMLSerializer();

  let html = "";
  for (const childNode of Array.from(element.childNodes)) {
    if (isElementNode(childNode) && startsWithUppercase(childNode.tagName)) {
      continue;
    }
    html += serializer.serializeToString(childNode);
  }
  return html;
};

const getFirstSignificantChild = (element: Element): Node | null => {
  for (const child of Array.from(element.childNodes)) {
    if (isTextNode(child)) {
      if ((child.textContent || "").trim().length === 0) {
        continue;
      }
      return child;
    }

    if (isElementNode(child)) {
      return child;
    }
  }
  return null;
};

const paragraphStartsWithTalkingElement = (paragraph: Element): Element | null => {
  const first = getFirstSignificantChild(paragraph);
  if (first && isElementNode(first) && first.getAttribute("talking") === "true") {
    return first;
  }
  return null;
};

const findFirstTalkingElement = (element: Element): Element | null => {
  for (const child of Array.from(element.childNodes)) {
    if (!isElementNode(child)) continue;

    const el = child as Element;
    if (el.getAttribute("talking") === "true") {
      return el;
    }

    if (el.tagName === "span") {
      const nested = findFirstTalkingElement(el);
      if (nested) return nested;
    }
  }
  return null;
};

const removeAllTalkingElementsWithin = (element: Element): void => {
  const toRemove: Element[] = [];
  const stack: Element[] = [element];
  while (stack.length) {
    const el = stack.pop()!;
    for (const child of Array.from(el.childNodes)) {
      if (isElementNode(child)) {
        const c = child as Element;
        if (c.getAttribute("talking") === "true") {
          toRemove.push(c);
        }
        stack.push(c);
      }
    }
  }
  for (const n of toRemove) {
    n.parentNode?.removeChild(n);
  }
};

const getPreviousSignificantElement = (node: Node | null): Element | null => {
  let current: Node | null = node;

  while (current) {
    if (isTextNode(current)) {
      if ((current.textContent || "").trim().length === 0) {
        current = current.previousSibling;
        continue;
      }
      return null;
    }

    if (isElementNode(current)) {
      return current as Element;
    }

    current = (current as Node).previousSibling;
  }

  return null;
};

const removeLeadingWhitespaceTextNodes = (element: Element): void => {
  while (
    element.firstChild &&
    isTextNode(element.firstChild) &&
    ((element.firstChild.textContent || "").trim().length === 0 || /^(\s|\u00A0)+$/.test(element.firstChild.textContent || ""))
  ) {
    element.removeChild(element.firstChild);
  }
};

const createTalkingLabelParagraph = (doc: Document, slug: string, displayName: string): Element => {
  const labelParagraph = doc.createElement("p");
  const talkingElement = doc.createElement(slug);
  talkingElement.setAttribute("talking", "true");
  labelParagraph.appendChild(talkingElement);
  const strong = doc.createElement("strong");
  strong.appendChild(doc.createTextNode(displayName));
  labelParagraph.appendChild(strong);
  labelParagraph.setAttribute("data-mixed-label", "true");
  labelParagraph.setAttribute("data-mixed-speaker", slug);
  return labelParagraph;
};

const preprocessMixedChapter = (chapter: Element, characterMap: Map<string, { display: string }>, doc: Document): void => {
  let current: Node | null = chapter.firstChild;

  while (current) {
    const nextSibling = current.nextSibling;

    if (isElementNode(current) && current.tagName === "p") {
      const paragraph = current as Element;
      const firstTalkingElement = findFirstTalkingElement(paragraph);

      if (firstTalkingElement) {
        const slug = firstTalkingElement.tagName;
        const displayName = characterMap.get(slug)?.display || slug.replace(/-/g, " ");
        const previousElement = getPreviousSignificantElement(paragraph.previousSibling);
        let shouldInsertLabel = true;

        if (previousElement?.tagName === "p") {
          const previousSpeakerSlug = previousElement.getAttribute("data-mixed-linked-speaker") || previousElement.getAttribute("data-mixed-speaker");
          if (previousSpeakerSlug === slug) {
            shouldInsertLabel = false;
          }
        }

        // If the talking element sits inside a span that already contains a <strong> label (Mixed-style), don't inject another label
        const parentEl = firstTalkingElement.parentNode as Element | null;
        let hasStrongLabelParent = false;
        if (parentEl && isElementNode(parentEl) && parentEl.tagName === "span") {
          hasStrongLabelParent = Array.from(parentEl.childNodes).some((n) => isElementNode(n) && (n as Element).tagName === "strong");
          if (hasStrongLabelParent) {
            shouldInsertLabel = false;
          }
        }

        if (shouldInsertLabel) {
          const labelParagraph = createTalkingLabelParagraph(doc, slug, displayName);
          chapter.insertBefore(labelParagraph, paragraph);
        }
        // Strip talking elements from the content paragraph unless this paragraph is already a Mixed-style label (span+strong)
        if (shouldInsertLabel || !hasStrongLabelParent) {
          removeAllTalkingElementsWithin(paragraph);
          removeLeadingWhitespaceTextNodes(paragraph);
        }
        // Mark paragraph as linked so follow-up passes and narrator injection treat it as dialogue
        paragraph.setAttribute("data-mixed-linked-speaker", slug);
      }
    }

    current = nextSibling;
  }

  const eligibleRun: Element[] = [];

  const flushEligibleRun = () => {
    if (eligibleRun.length === 1) {
      eligibleRun[0].setAttribute("data-mixed-narrator-break", "true");
    }
    eligibleRun.length = 0;
  };

  current = chapter.firstChild;

  while (current) {
    const nextSibling = current.nextSibling;

    if (isTextNode(current)) {
      if ((current.textContent || "").trim().length === 0) {
        current = nextSibling;
        continue;
      }
      flushEligibleRun();
      current = nextSibling;
      continue;
    }

    if (!isElementNode(current)) {
      flushEligibleRun();
      current = nextSibling;
      continue;
    }

    const element = current as Element;

    if (element.tagName !== "p") {
      flushEligibleRun();
      current = nextSibling;
      continue;
    }

    const paragraph = element;
    const startsWithTalking = Boolean(paragraphStartsWithTalkingElement(paragraph));
    const rawHtml = extractInnerHTML(paragraph);
    const isPureDidaskalia = isDidaskaliaHTML(rawHtml);
    const containsTalkingCharacter = Boolean(findFirstTalkingCharacterSlug(paragraph, characterMap));

    if (paragraph.hasAttribute("data-mixed-linked-speaker")) {
      flushEligibleRun();
      current = nextSibling;
      continue;
    }

    if (!startsWithTalking && !isPureDidaskalia && !containsTalkingCharacter) {
      eligibleRun.push(paragraph);
    } else {
      flushEligibleRun();
    }

    current = nextSibling;
  }

  flushEligibleRun();
};

const preprocessMixedDocument = (xmlDoc: Document, characterMap: Map<string, { display: string }>): void => {
  const chapters = xmlDoc.getElementsByTagName("Chapter");
  for (const chapter of Array.from(chapters)) {
    preprocessMixedChapter(chapter, characterMap, xmlDoc);
  }
};

type ParagraphMetadata = { rawHtml: string; isPureDidaskalia: boolean; firstSpeakerSlug: string | null };

const renderParagraph = (
  paragraph: Element,
  metadata: ParagraphMetadata[],
  metadataIndex: number,
  state: { dataIndex: number; currentCharacterAlignment: "left" | "right"; lastSpeakerSlug: string | null; playRowState: PlayRowState | null },
  isPlayFormat: boolean,
  bookSlug: string,
  characterMap: Map<string, { display: string }>,
): { html: string; dataIndex: number; currentCharacterAlignment: "left" | "right"; lastSpeakerSlug: string | null } => {
  const segments: string[] = [];
  let { dataIndex, currentCharacterAlignment, lastSpeakerSlug } = state;

  let forceNewRow = false;
  const info = metadata[metadataIndex];
  const speakerSlug = info?.firstSpeakerSlug || null;
  if (speakerSlug) {
    forceNewRow = true;
    if (lastSpeakerSlug === null) {
      currentCharacterAlignment = "left";
    } else if (speakerSlug !== lastSpeakerSlug) {
      currentCharacterAlignment = currentCharacterAlignment === "left" ? "right" : "left";
    }
    lastSpeakerSlug = speakerSlug;
  }

  const paragraphRender = renderParagraphContent(paragraph, { characterMap, isLikelyCharacterTag, bookSlug });

  if (paragraphRender.hasTalkingCharacter) {
    forceNewRow = true;
  }

  const pContent = paragraphRender.content;
  if (!pContent.trim()) {
    return { html: "", dataIndex, currentCharacterAlignment, lastSpeakerSlug };
  }

  let clean = normalizeParagraphWhitespace(pContent);

  if (isPlayFormat) {
    const { rawHtml, isPureDidaskalia } = info;

    let currentCharacterContinues = false;
    if (isPureDidaskalia && state.playRowState.isRowOpen()) {
      for (let nextIndex = metadataIndex + 1; nextIndex < metadata.length; nextIndex++) {
        const nextMeta = metadata[nextIndex];
        const nextSpeaker = nextMeta.firstSpeakerSlug;
        if (nextSpeaker && nextSpeaker !== lastSpeakerSlug) {
          break;
        }

        if (!nextMeta.isPureDidaskalia) {
          currentCharacterContinues = true;
          break;
        }
      }
    }

    const isDidaskaliaParagraph = isPureDidaskalia && !currentCharacterContinues;
    if (isDidaskaliaParagraph) {
      segments.push(state.playRowState.ensureDidaskaliaRow());
      segments.push(`\n    <p data-index="${dataIndex++}" data-is-didaskalia="true">\n      ${clean}\n    </p>`);

      const nextMeta = metadata[metadataIndex + 1];
      if (!nextMeta || !nextMeta.isPureDidaskalia) {
        segments.push(state.playRowState.closeDidaskaliaRow());
      }

      return { html: segments.join(""), dataIndex, currentCharacterAlignment, lastSpeakerSlug };
    }

    const characterPlaceholderSpans: string[] = [];
    clean = clean.replace(/<span class="character-placeholder[^>]*>.*?<\/span>/g, (match) => {
      characterPlaceholderSpans.push(match);
      return "";
    });
    const isSoloNarrationBreak = paragraph.getAttribute("data-mixed-narrator-break") === "true";

    if (isSoloNarrationBreak) {
      segments.push(state.playRowState.ensureDidaskaliaRow());
      segments.push(`\n    <p data-index="${dataIndex++}" data-is-didaskalia="true">\n      ${clean}\n    </p>`);
      segments.push(state.playRowState.closeDidaskaliaRow());
      return { html: segments.join(""), dataIndex, currentCharacterAlignment, lastSpeakerSlug };
    }

    const hasAvatar = characterPlaceholderSpans.length > 0;
    const isMixedLabelParagraph = paragraph.getAttribute("data-mixed-label") === "true";

    if (!state.playRowState.isRowOpen() || forceNewRow) {
      segments.push(state.playRowState.openCharacterRow(currentCharacterAlignment, hasAvatar, characterPlaceholderSpans.join("")));
    }

    const wrappedByEm = /^<em[\s>][\s\S]*<\/em>$/.test(rawHtml.trim());
    const hasDidaskaliaInDialogue = wrappedByEm || (isPureDidaskalia && currentCharacterContinues);

    const isCharacterParagraph = speakerSlug !== null;

    const dataIndexAttribute = isMixedLabelParagraph ? "" : `\n  data-index="${dataIndex++}"`;
    segments.push(`\n    <p${dataIndexAttribute}
  data-text-alignment="${currentCharacterAlignment}"
  data-is-character="${isCharacterParagraph ? "true" : "false"}"
  data-is-didaskalia="${hasDidaskaliaInDialogue ? "true" : "false"}"
>\n      ${clean}\n    </p>`);

    return { html: segments.join(""), dataIndex, currentCharacterAlignment, lastSpeakerSlug };
  }

  segments.push(`\n <p data-index="${dataIndex++}">\n ${clean}\n </p>`);
  return { html: segments.join(""), dataIndex, currentCharacterAlignment, lastSpeakerSlug };
};

const getChapterTitle = (chapter: Element): string => {
  let currentAct = "";
  const actElements = chapter.getElementsByTagName("h3").length > 0 ? chapter.getElementsByTagName("h3") : chapter.getElementsByTagName("Act");

  const titleElements = chapter.getElementsByTagName("h4").length > 0 ? chapter.getElementsByTagName("h4") : chapter.getElementsByTagName("Title");

  const subtitleElements = chapter.getElementsByTagName("h5").length > 0 ? chapter.getElementsByTagName("h5") : chapter.getElementsByTagName("Subtitle");

  if (actElements.length > 0) {
    currentAct = getTitleText(actElements[0]);
  }

  const titleText = getTitleText(titleElements[0]);
  const subtitleText = getTitleText(subtitleElements[0]);

  const chapterTitle = [currentAct, titleText && subtitleText ? titleText.replace(/\.$/, "") : titleText, subtitleText].filter(Boolean).join(", ");

  return chapterTitle;
};

const getChapterTitles = (chapters: LiveNodeList<XMLElement>): Array<{ id: string; title: string }> => {
  const chapterTitles: Array<{ id: string; title: string }> = [];

  for (const chapter of chapters) {
    chapterTitles.push({ id: chapter.getAttribute("id") || "", title: getChapterTitle(chapter) });
  }

  return chapterTitles;
};

const getCharacterMap = (xmlDoc: Document): Map<string, { display: string }> => {
  const charactersMaster = xmlDoc.getElementsByTagName("CharactersMaster")[0];
  const characterMap = new Map<string, { display: string }>();
  if (charactersMaster) {
    for (let i = 0; i < charactersMaster.childNodes.length; i++) {
      const node = charactersMaster.childNodes[i];
      if (isElementNode(node)) {
        const element = node as Element;
        const tagName = element.tagName;
        const display = element.getAttribute("display") || tagName.replace(/-/g, " ");
        characterMap.set(tagName, { display });
      }
    }
  }

  const allEls = xmlDoc.getElementsByTagName("*");
  for (let i = 0; i < allEls.length; i++) {
    const t = allEls[i].tagName;
    if (isLikelyCharacterTag(t) && !characterMap.has(t)) {
      characterMap.set(t, { display: t.replace(/-/g, " ") });
    }
  }

  return characterMap;
};

const getParagraphMetadata = (chapter: Element, characterMap: Map<string, { display: string }>): ParagraphMetadata[] =>
  Array.from(chapter.childNodes)
    .filter(isElementNode)
    .filter((el) => el.tagName === "p")
    .map((paragraphElement) => ({
      rawHtml: extractInnerHTML(paragraphElement),
      isPureDidaskalia: isDidaskaliaHTML(extractInnerHTML(paragraphElement)),
      firstSpeakerSlug: findFirstTalkingCharacterSlug(paragraphElement, characterMap),
    }));

const ensureProperPolishTextBreaking = (html: string): string => {
  const conjunctions = "a|i|o|u|w|z|na|do|od|za|po|we|ku|ze|co|że|bo|iż|ni|nad|pod|bez|dla|oraz|ale|lub|czy|ani";
  const conjunctionsRegex = new RegExp(`(?<=\\s|&nbsp;)(${conjunctions})\\s`, "gi");

  return html.replace(/>([^<]+)</g, (_match, textContent) => {
    const formattedText = textContent.replace(conjunctionsRegex, "$1&nbsp;");
    return `>${formattedText}<`;
  });
};

const renderChapter = (chapter: Element, characterMap: Map<string, { display: string }>, isPlayFormat: boolean, bookSlug: string): string => {
  let currentCharacterAlignment: "left" | "right" = "left";
  let lastSpeakerSlug: string | null = null;

  const playRowState = isPlayFormat ? new PlayRowState() : null;

  const paragraphMetadata = getParagraphMetadata(chapter, characterMap);

  let htmlResult = `\n      <section><section data-chapter="${chapter.getAttribute("id")}">`;
  let dataIndex = 0;

  // ─── iterate over chapter children ───
  let paragraphMetaIndex = 0;

  const htmlResults = Array.from(chapter.childNodes)
    .filter(isElementNode)
    .map((childElement) => {
      const tagName = childElement.tagName;

      switch (tagName) {
        case "p": {
          const paragraphResult = renderParagraph(
            childElement,
            paragraphMetadata,
            paragraphMetaIndex,
            { dataIndex, currentCharacterAlignment, lastSpeakerSlug, playRowState },
            isPlayFormat,
            bookSlug,
            characterMap,
          );
          paragraphMetaIndex++;

          dataIndex = paragraphResult.dataIndex;
          currentCharacterAlignment = paragraphResult.currentCharacterAlignment;
          lastSpeakerSlug = paragraphResult.lastSpeakerSlug;
          return paragraphResult.html;
        }
        case "h3":
        case "Act":
          return `\n    <h3 data-index="${dataIndex++}" data-act="true">${childElement.textContent || ""}</h3>`;
        case "h4":
        case "Title":
          return `\n    <h4 data-index="${dataIndex++}">${childElement.textContent || ""}</h4>`;
        case "h5":
        case "Subtitle":
          return `\n    <h5 data-index="${dataIndex++}">${childElement.textContent || ""}</h5>`;
        default: {
          const serializedInner = serializeLowercaseChildren(childElement);
          return `\n    <${tagName} data-index="${dataIndex++}">${serializedInner}</${tagName}>`;
        }
      }
    });

  htmlResult += htmlResults.join("");

  if (isPlayFormat) {
    htmlResult += playRowState.closeRow();
  }

  htmlResult += "\n  </section></section>";
  return htmlResult;
};

export const xmlToComplexHtml = (xmlString: string, bookSlug: string, bookLang: string): { htmlResult: string; chapterTitles: Array<{ id: string; title: string }> } => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  const characterMap = getCharacterMap(xmlDoc);

  const bookForm = xmlDoc.getElementsByTagName("Form")[0];
  const bookFormValue = bookForm ? bookForm.textContent : "";

  if (bookFormValue === "Mixed") {
    preprocessMixedDocument(xmlDoc, characterMap);
  }

  const isPlayFormat = bookFormValue === "Play" || bookFormValue === "Mixed";

  let htmlResult = "";

  if (bookFormValue === "Play") {
    htmlResult += `\n    <div class="play-container">`;
  } else if (bookFormValue === "Mixed") {
    htmlResult += `\n    <div class="play-container mixed-container">`;
  }

  const chapters = xmlDoc.getElementsByTagName("Chapter");

  for (const chapter of chapters) {
    htmlResult += renderChapter(chapter, characterMap, isPlayFormat, bookSlug);
  }

  if (isPlayFormat) {
    htmlResult += `\n    </div>`;
  }

  if (bookLang === "polish" && !isPlayFormat) {
    htmlResult = ensureProperPolishTextBreaking(htmlResult);
  }

  htmlResult = wrapPunctuationAdvanced(htmlResult);

  return { htmlResult: htmlResult.trim(), chapterTitles: getChapterTitles(chapters) };
};
