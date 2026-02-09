export const MIXED_FORMAT_LEAF_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "td",
  "th",
  "dt",
  "dd",
  "figcaption",
  "hr",
  "cite",
  "img",
]);

export const MIXED_FORMAT_NON_TEXT_LEAF_TAGS = new Set(["img", "hr"]);

export const MIXED_FORMAT_CONTAINER_TAGS = new Set([
  "blockquote",
  "div",
  "section",
  "table",
  "tbody",
  "thead",
  "tfoot",
  "tr",
  "ol",
  "ul",
  "dl",
  "header",
  "footer",
  "figure",
  "aside",
  "hgroup",
]);

export interface MixedFormatLeafTraversalAdapter<TNode> {
  getTagName(node: TNode): string | null | undefined;
  getTextContent(node: TNode): string | null | undefined;
  getChildren(node: TNode): TNode[];
}

export function forEachIndexedMixedFormatLeaf<TNode>(
  roots: TNode[],
  adapter: MixedFormatLeafTraversalAdapter<TNode>,
  onLeaf: (node: TNode, dataIndex: number) => void,
  startIndex = 0,
): number {
  let index = startIndex;

  function recurse(node: TNode): void {
    const tag = (adapter.getTagName(node) || "").toLowerCase();
    const text = (adapter.getTextContent(node) || "").trim();
    const children = adapter.getChildren(node);

    if (MIXED_FORMAT_LEAF_TAGS.has(tag)) {
      if (!text && !MIXED_FORMAT_NON_TEXT_LEAF_TAGS.has(tag)) {
        return;
      }
      onLeaf(node, index++);
      return;
    }

    if (MIXED_FORMAT_CONTAINER_TAGS.has(tag)) {
      if (children.length === 0) {
        if (!text) {
          return;
        }
        onLeaf(node, index++);
        return;
      }
      for (const child of children) {
        recurse(child);
      }
      return;
    }

    if (children.length > 0) {
      if (!text) {
        for (const child of children) {
          recurse(child);
        }
        return;
      }

      onLeaf(node, index++);
      return;
    }

    if (text) {
      onLeaf(node, index++);
    }
  }

  for (const root of roots) {
    recurse(root);
  }

  return index;
}
