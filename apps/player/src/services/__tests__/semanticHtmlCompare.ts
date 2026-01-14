/**
 * Semantic HTML Comparison Utility
 *
 * Compares two HTML strings by their DOM structure, ignoring:
 * - Whitespace differences
 * - Attribute ordering
 * - Self-closing vs non-self-closing empty tags
 *
 * Useful for testing that different source HTML formats produce
 * identical rendered output after normalization.
 */

export interface SemanticNode {
  type: "element" | "text";
  tag?: string;
  attributes?: Record<string, string>;
  children?: SemanticNode[];
  text?: string;
}

/**
 * Extract semantic structure from an HTML element, ignoring whitespace.
 */
function extractSemanticNode(node: Node): SemanticNode | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    if (!text) return null; // Ignore whitespace-only text nodes
    return { type: "text", text };
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // Extract attributes as sorted key-value pairs
    const attributes: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      attributes[attr.name] = attr.value;
    }

    // Recursively extract children
    const children: SemanticNode[] = [];
    for (const child of Array.from(el.childNodes)) {
      const semanticChild = extractSemanticNode(child);
      if (semanticChild) {
        children.push(semanticChild);
      }
    }

    return {
      type: "element",
      tag,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      children: children.length > 0 ? children : undefined,
    };
  }

  return null;
}

/**
 * Parse HTML string and extract semantic structure.
 */
export function extractSemanticStructure(html: string): SemanticNode | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Find the main content - either section[data-chapter] or first body child
  const section = doc.querySelector("section[data-chapter]");
  if (section) {
    return extractSemanticNode(section);
  }

  // Fallback: use body content
  const body = doc.body;
  if (body.children.length === 1) {
    return extractSemanticNode(body.children[0]);
  }

  // Multiple root elements - wrap in virtual container
  const children: SemanticNode[] = [];
  for (const child of Array.from(body.childNodes)) {
    const semanticChild = extractSemanticNode(child);
    if (semanticChild) {
      children.push(semanticChild);
    }
  }

  return { type: "element", tag: "root", children };
}

type CompareResult = { match: boolean; diff?: string };

function compareAttributes(
  aAttrs: Record<string, string>,
  bAttrs: Record<string, string>,
  path: string,
): CompareResult | null {
  const allKeys = new Set([...Object.keys(aAttrs), ...Object.keys(bAttrs)]);
  for (const key of allKeys) {
    if (aAttrs[key] !== bAttrs[key]) {
      return { match: false, diff: `${path}[@${key}]: "${aAttrs[key]}" vs "${bAttrs[key]}"` };
    }
  }
  return null;
}

function compareChildren(
  aChildren: SemanticNode[],
  bChildren: SemanticNode[],
  path: string,
): CompareResult | null {
  if (aChildren.length !== bChildren.length) {
    return {
      match: false,
      diff: `${path}: child count mismatch (${aChildren.length} vs ${bChildren.length})`,
    };
  }
  for (let i = 0; i < aChildren.length; i++) {
    const childResult = compareSemanticStructures(aChildren[i], bChildren[i], `${path}[${i}]`);
    if (!childResult.match) return childResult;
  }
  return null;
}

/**
 * Compare two semantic structures for equality.
 * Returns detailed diff info if they don't match.
 */
export function compareSemanticStructures(
  a: SemanticNode | null,
  b: SemanticNode | null,
  path = "",
): CompareResult {
  if (a === null && b === null) return { match: true };
  if (a === null || b === null) return { match: false, diff: `${path}: one is null, other is not` };
  if (a.type !== b.type)
    return { match: false, diff: `${path}: type mismatch (${a.type} vs ${b.type})` };

  if (a.type === "text") {
    return a.text === b.text
      ? { match: true }
      : { match: false, diff: `${path}: text mismatch ("${a.text}" vs "${b.text}")` };
  }

  if (a.tag !== b.tag)
    return { match: false, diff: `${path}: tag mismatch (${a.tag} vs ${b.tag})` };

  const currentPath = path ? `${path} > ${a.tag}` : a.tag || "root";

  const attrDiff = compareAttributes(a.attributes ?? {}, b.attributes ?? {}, currentPath);
  if (attrDiff) return attrDiff;

  const childDiff = compareChildren(a.children ?? [], b.children ?? [], currentPath);
  if (childDiff) return childDiff;

  return { match: true };
}

/**
 * High-level comparison function for test assertions.
 * Takes two HTML strings and returns whether they're semantically equivalent.
 */
export function semanticHtmlEquals(
  htmlA: string,
  htmlB: string,
): { match: boolean; diff?: string } {
  const structA = extractSemanticStructure(htmlA);
  const structB = extractSemanticStructure(htmlB);
  return compareSemanticStructures(structA, structB);
}

/**
 * Pretty-print a semantic structure for debugging.
 */
export function prettyPrintSemantic(node: SemanticNode | null, indent = 0): string {
  if (!node) return "(null)";

  const pad = "  ".repeat(indent);

  if (node.type === "text") {
    return `${pad}"${node.text}"`;
  }

  const attrs = node.attributes
    ? " " +
      Object.entries(node.attributes)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ")
    : "";

  if (!node.children || node.children.length === 0) {
    return `${pad}<${node.tag}${attrs} />`;
  }

  const childStr = node.children.map((c) => prettyPrintSemantic(c, indent + 1)).join("\n");
  return `${pad}<${node.tag}${attrs}>\n${childStr}\n${pad}</${node.tag}>`;
}
