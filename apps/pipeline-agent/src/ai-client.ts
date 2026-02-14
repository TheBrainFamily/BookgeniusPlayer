import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "fs";
import { join } from "path";
import { getTextDiff } from "./lib/text-verifier";

const CHAPTER_PROCESSOR_PROMPT = readFileSync(
  join(import.meta.dir, "prompts", "chapter-processor.md"),
  "utf-8",
);

export interface ProcessChapterOptions {
  /** The per-chapter user prompt (includes file path, known characters, etc.) */
  prompt: string;
  /** Working directory for the agent (where chapter files live) */
  workspaceDir: string;
  /** Chapter number for log prefixing */
  chapterNumber: number;
  /** Path to the original (unedited) chapter file, for text invariance checks */
  originalFilePath: string;
  /** Path to the working chapter file being edited */
  chapterFilePath: string;
  /** Model to use. Default: "sonnet" */
  model?: string;
  /** Max agent turns. Default: 200 */
  maxTurns?: number;
}

/**
 * Runs the Claude agent SDK to process a single chapter.
 *
 * The agent reads the chapter XHTML, identifies dialogue and characters,
 * and makes surgical Edit calls to add data-speaker/data-c/data-reveals attributes.
 */
export async function processChapter(options: ProcessChapterOptions): Promise<SDKMessage[]> {
  const {
    prompt,
    workspaceDir,
    chapterNumber,
    originalFilePath,
    chapterFilePath,
    model = "claude-haiku-4-5",
    maxTurns = 200,
  } = options;
  const prefix = `  [ch${chapterNumber}]`;

  const messages: SDKMessage[] = [];

  for await (const message of query({
    prompt,
    options: {
      model,
      maxTurns,
      cwd: workspaceDir,
      tools: ["Read", "Edit", "Write", "Grep", "Glob", "Bash"],
      allowedTools: ["Read", "Edit", "Write", "Grep", "Glob", "Bash"],
      systemPrompt: { type: "preset", preset: "claude_code", append: CHAPTER_PROCESSOR_PROMPT },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      hooks: {
        PostToolUse: [
          {
            matcher: "Edit",
            hooks: [
              async (input): Promise<HookJSONOutput> => {
                if (input.hook_event_name !== "PostToolUse") return { continue: true };
                const toolInput = input.tool_input as { file_path?: string } | undefined;
                const editedPath = toolInput?.file_path;

                // Only verify edits to the chapter file
                if (!editedPath || !editedPath.endsWith(chapterFilePath.split("/").pop() || "")) {
                  return { continue: true };
                }

                const diff = getTextDiff(originalFilePath, editedPath);
                if (!diff) {
                  return { continue: true }; // Text intact — silent, zero extra tokens
                }

                console.log(`${prefix} \x1b[31mText corruption detected after edit!\x1b[0m`);
                return {
                  continue: true,
                  hookSpecificOutput: {
                    hookEventName: "PostToolUse" as const,
                    additionalContext:
                      `TEXT CORRUPTION DETECTED: Your last edit changed the visible text content. ` +
                      `This must be fixed immediately.\n\nDiff:\n${diff}\n\n` +
                      `Undo this change by using Edit to restore the original text, then retry the annotation carefully. ` +
                      `Your edits must ONLY add HTML attributes/wrapping — never modify text content.`,
                  },
                };
              },
            ],
          },
        ],
      },
    },
  })) {
    messages.push(message);
    logMessage(message, prefix);
  }

  return messages;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

function logMessage(message: SDKMessage, prefix: string): void {
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if (block.type === "text" && block.text) {
        // Show agent's reasoning/thoughts
        const text = block.text.replace(/\n/g, " ").trim();
        if (text) {
          console.log(`${prefix} \x1b[36m${truncate(text, 300)}\x1b[0m`);
        }
      }
      if (block.type === "tool_use") {
        logToolUse(block, prefix);
      }
    }
  }
  if (message.type === "result") {
    logResultMessage(message, prefix);
  }
}

function logToolUse(block: { name: string; input?: unknown }, prefix: string): void {
  const input = block.input as Record<string, unknown> | undefined;
  if (!input) {
    console.log(`${prefix} Tool: ${block.name}`);
    return;
  }

  switch (block.name) {
    case "Read": {
      const file = basename(input.file_path as string);
      const offset = input.offset ? ` offset=${input.offset}` : "";
      const limit = input.limit ? ` limit=${input.limit}` : "";
      console.log(`${prefix} \x1b[90mRead ${file}${offset}${limit}\x1b[0m`);
      break;
    }
    case "Edit": {
      const file = basename(input.file_path as string);
      const oldStr = truncate(String(input.old_string || "").replace(/\n/g, "\\n"), 80);
      const newStr = truncate(String(input.new_string || "").replace(/\n/g, "\\n"), 80);
      console.log(`${prefix} \x1b[32mEdit ${file}\x1b[0m`);
      console.log(`${prefix}   \x1b[31m- ${oldStr}\x1b[0m`);
      console.log(`${prefix}   \x1b[32m+ ${newStr}\x1b[0m`);
      break;
    }
    case "Write": {
      const file = basename(input.file_path as string);
      console.log(`${prefix} Write ${file}`);
      break;
    }
    case "Grep":
      console.log(`${prefix} \x1b[90mGrep "${input.pattern}"\x1b[0m`);
      break;
    case "Glob":
      console.log(`${prefix} \x1b[90mGlob "${input.pattern}"\x1b[0m`);
      break;
    case "Bash":
      console.log(`${prefix} \x1b[90mBash: ${truncate(String(input.command || ""), 100)}\x1b[0m`);
      break;
    default:
      console.log(`${prefix} Tool: ${block.name}`);
  }
}

function basename(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

export function logResultMessage(message: SDKMessage, prefix: string): void {
  if (message.type !== "result") return;

  const dim = "\x1b[90m";
  const yellow = "\x1b[33m";
  const reset = "\x1b[0m";

  const dur = `${(message.duration_ms / 1000).toFixed(1)}s`;
  const apiDur = `${(message.duration_api_ms / 1000).toFixed(1)}s`;
  const cost = `$${message.total_cost_usd.toFixed(4)}`;
  const turns = message.num_turns;

  console.log(`${prefix} ${yellow}Result: ${message.subtype}${reset}`);
  console.log(
    `${prefix}   ${dim}Duration: ${dur} total, ${apiDur} API | Turns: ${turns} | Cost: ${cost}${reset}`,
  );

  // Per-model token breakdown
  for (const [model, usage] of Object.entries(message.modelUsage)) {
    const input = fmt(usage.inputTokens);
    const output = fmt(usage.outputTokens);
    const cacheRead = usage.cacheReadInputTokens;
    const cacheCreate = usage.cacheCreationInputTokens;

    let line = `${prefix}   ${dim}${model}: ${input} in → ${output} out`;
    if (cacheRead > 0 || cacheCreate > 0) {
      line += ` | cache: ${fmt(cacheRead)} read, ${fmt(cacheCreate)} write`;
    }
    line += ` | $${usage.costUSD.toFixed(4)}${reset}`;
    console.log(line);
  }

  // Aggregate usage
  const u = message.usage;
  console.log(
    `${prefix}   ${dim}Total tokens: ${fmt(u.input_tokens)} in + ${fmt(u.output_tokens)} out = ${fmt(u.input_tokens + u.output_tokens)}${reset}`,
  );
}
