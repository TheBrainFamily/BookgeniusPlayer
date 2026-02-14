import { readFileSync, writeFileSync } from "fs";
import type { Annotation, ContainerAnnotation, ChapterAnnotations } from "../types";

interface ApplyResult {
  applied: number;
  failed: Annotation[];
  containerApplied: number;
  containerFailed: ContainerAnnotation[];
}

/**
 * Applies structured annotations to an XHTML file.
 *
 * For each annotation:
 * 1. Find searchText in the HTML source
 * 2. Within that match, wrap wrapText with the appropriate span
 *
 * This is purely algorithmic — no LLM needed.
 */
export function applyAnnotations(filePath: string, annotations: ChapterAnnotations): ApplyResult {
  let html = readFileSync(filePath, "utf-8");

  const failed: Annotation[] = [];
  let applied = 0;

  for (const ann of annotations.annotations) {
    const result = applySingleAnnotation(html, ann);
    if (result !== null) {
      html = result;
      applied++;
    } else {
      failed.push(ann);
    }
  }

  // Apply container annotations (data-speaker on blockquote/section/article)
  const containerFailed: ContainerAnnotation[] = [];
  let containerApplied = 0;

  for (const cann of annotations.containerAnnotations) {
    const result = applyContainerAnnotation(html, cann);
    if (result !== null) {
      html = result;
      containerApplied++;
    } else {
      containerFailed.push(cann);
    }
  }

  writeFileSync(filePath, html, "utf-8");

  return { applied, failed, containerApplied, containerFailed };
}

function applySingleAnnotation(html: string, ann: Annotation): string | null {
  // Find the searchText in the raw HTML
  const searchIdx = html.indexOf(ann.searchText);
  if (searchIdx === -1) return null;

  // Check uniqueness — if multiple matches, this is ambiguous
  const secondIdx = html.indexOf(ann.searchText, searchIdx + 1);
  if (secondIdx !== -1) {
    // Ambiguous match — try to proceed with first occurrence anyway
    // (agent should provide enough context for uniqueness, but be forgiving)
  }

  // Within the searchText region, find wrapText
  const regionStart = searchIdx;
  const region = html.slice(regionStart, regionStart + ann.searchText.length);
  const wrapIdx = region.indexOf(ann.wrapText);
  if (wrapIdx === -1) return null;

  const absoluteWrapStart = regionStart + wrapIdx;
  const absoluteWrapEnd = absoluteWrapStart + ann.wrapText.length;

  const attr = ann.type === "speaker" ? "data-speaker" : "data-c";
  const revealsAttr = ann.reveals ? ` data-reveals="${ann.reveals}"` : "";
  const openTag = `<span ${attr}="${ann.slug}"${revealsAttr}>`;
  const closeTag = "</span>";

  return (
    html.slice(0, absoluteWrapStart) +
    openTag +
    ann.wrapText +
    closeTag +
    html.slice(absoluteWrapEnd)
  );
}

function applyContainerAnnotation(html: string, cann: ContainerAnnotation): string | null {
  // Find a container tag that contains the searchText
  const searchIdx = html.indexOf(cann.searchText);
  if (searchIdx === -1) return null;

  // Walk backwards from searchText to find the opening tag
  const tagPattern = new RegExp(`<${cann.tag}\\b[^>]*>`, "g");
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(html)) !== null) {
    if (match.index > searchIdx) break;
    lastMatch = match;
  }

  if (!lastMatch) return null;

  // Insert data-speaker attribute into the opening tag
  const tagStr = lastMatch[0];
  if (tagStr.includes("data-speaker")) return null; // Already annotated

  const insertPos = lastMatch.index + cann.tag.length + 1; // After "<tag"
  return html.slice(0, insertPos) + ` data-speaker="${cann.slug}"` + html.slice(insertPos);
}
