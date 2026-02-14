import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import { join } from "path";
import type { ChapterAnnotations } from "./types";
import type { CharacterRegistry } from "./lib/character-registry";
import { logResultMessage } from "./ai-client";

const STRUCTURED_PROMPT = readFileSync(
  join(import.meta.dir, "prompts", "chapter-annotator-structured.md"),
  "utf-8",
);

const ANNOTATIONS_SCHEMA = {
  type: "object",
  properties: {
    annotations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          searchText: { type: "string" },
          wrapText: { type: "string" },
          type: { type: "string", enum: ["speaker", "mention"] },
          slug: { type: "string" },
          reveals: { type: "string" },
        },
        required: ["searchText", "wrapText", "type", "slug"],
      },
    },
    containerAnnotations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          searchText: { type: "string" },
          tag: { type: "string" },
          slug: { type: "string" },
        },
        required: ["searchText", "tag", "slug"],
      },
    },
    newCharacters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["slug", "name", "description"],
      },
    },
  },
  required: ["annotations", "containerAnnotations", "newCharacters"],
} as const;

export interface StructuredChapterOptions {
  chapterHtml: string;
  chapterNumber: number;
  registry: CharacterRegistry;
  model?: string;
}

/**
 * Processes a chapter by sending the full HTML to the model and getting back
 * structured JSON annotations. No tool calls — single request/response.
 */
export async function processChapterStructured(
  options: StructuredChapterOptions,
): Promise<ChapterAnnotations> {
  const { chapterHtml, chapterNumber, registry, model = "sonnet" } = options;
  const prefix = `  [ch${chapterNumber}]`;

  const userPrompt = [
    `## Chapter ${chapterNumber}`,
    "",
    "### Known Characters",
    "",
    registry.toPromptContext(),
    "",
    "### Chapter XHTML",
    "",
    "```html",
    chapterHtml,
    "```",
  ].join("\n");

  console.log(`${prefix} Sending ${chapterHtml.length} chars to model...`);

  let resultJson: string | null = null;

  for await (const message of query({
    prompt: userPrompt,
    options: {
      model,
      maxTurns: 1,
      tools: [],
      allowedTools: [],
      systemPrompt: STRUCTURED_PROMPT,
      outputFormat: { type: "json_schema", schema: ANNOTATIONS_SCHEMA },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text) {
          resultJson = block.text;
        }
      }
    }
    if (message.type === "result") {
      logResultMessage(message, prefix);
    }
  }

  if (!resultJson) {
    throw new Error(`No response from model for chapter ${chapterNumber}`);
  }

  const parsed: ChapterAnnotations = JSON.parse(resultJson);
  console.log(
    `${prefix} ${parsed.annotations.length} annotations, ` +
      `${parsed.containerAnnotations.length} containers, ` +
      `${parsed.newCharacters.length} new characters`,
  );

  return parsed;
}
