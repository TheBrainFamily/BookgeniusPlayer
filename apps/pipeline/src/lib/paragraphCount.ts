import {
  countParagraphsFromChapterHtml,
  type ParagraphCountOptions,
} from "@player/services/htmlNormalizer";
import { ensureDomParser } from "./domParser";

export function computeParagraphCount(html: string, options?: ParagraphCountOptions): number {
  ensureDomParser();
  return countParagraphsFromChapterHtml(html, options);
}
