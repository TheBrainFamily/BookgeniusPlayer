#!/usr/bin/env bun
/**
 * Calls Wallaby MCP server to check for failing tests.
 * Used as a PostToolUse hook to get instant test feedback after code changes.
 *
 * Uses polling to wait for Wallaby to process file changes before reporting.
 *
 * NOTE: Skips execution in git worktrees since Wallaby runs only in the main repo.
 */

import { spawn, type ChildProcess } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { existsSync, statSync } from "fs";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string };
  id: number;
}

interface WallabyTest {
  id: string;
  name: string[];
  status: string;
  file: string;
  line: number;
  time?: number;
  errors?: Array<{ message: string }>;
}

interface WallabyResult {
  tests: WallabyTest[];
  coveragePercentage: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class WallabyMcpClient {
  private proc: ChildProcess;
  private buffer = "";
  private requestId = 0;
  private responseHandlers = new Map<number, (response: JsonRpcResponse) => void>();

  constructor() {
    const mcpPath = join(homedir(), ".wallaby", "mcp");
    this.proc = spawn("node", [mcpPath], { stdio: ["pipe", "pipe", "pipe"] });

    this.proc.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });
  }

  private processBuffer() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        const handler = this.responseHandlers.get(response.id);
        if (handler) {
          this.responseHandlers.delete(response.id);
          handler(response);
        }
      } catch {
        // Ignore non-JSON lines
      }
    }
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = ++this.requestId;
    const request: JsonRpcRequest = { jsonrpc: "2.0", method, params, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseHandlers.delete(id);
        reject(new Error("Timeout"));
      }, 5000);

      this.responseHandlers.set(id, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      this.proc.stdin?.write(JSON.stringify(request) + "\n");
    });
  }

  sendNotification(method: string) {
    this.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  }

  async initialize() {
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "wallaby-check", version: "1.0.0" },
    });
    this.sendNotification("notifications/initialized");
  }

  async getFailingTests(): Promise<WallabyResult> {
    const response = await this.sendRequest("tools/call", {
      name: "wallaby_failingTests",
      arguments: {},
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    const content = response.result as { content: Array<{ type: string; text: string }> };
    return JSON.parse(content.content[0].text) as WallabyResult;
  }

  kill() {
    this.proc.kill();
  }
}

// Create a hash of test state to detect changes
function hashTestState(result: WallabyResult): string {
  const testStates = result.tests.map((t) => `${t.id}:${t.status}`).sort();
  return testStates.join("|");
}

/**
 * Detect if we're running in a git worktree.
 * In a worktree, .git is a file (pointing to main repo) instead of a directory.
 */
function isGitWorktree(): boolean {
  const gitPath = join(process.cwd(), ".git");
  if (!existsSync(gitPath)) return false;
  return statSync(gitPath).isFile();
}

async function main() {
  // Skip Wallaby checks in worktrees (Wallaby only runs in main repo)
  if (isGitWorktree()) {
    process.exit(0);
  }

  const client = new WallabyMcpClient();

  try {
    await client.initialize();

    // Get initial state
    let result = await client.getFailingTests();
    let lastHash = hashTestState(result);
    let stableCount = 0;

    // Poll until state is stable (same hash for 2 consecutive checks)
    // or timeout after 1.5s
    const startTime = Date.now();
    const maxWait = 1500;
    const pollInterval = 100;

    while (Date.now() - startTime < maxWait) {
      await sleep(pollInterval);

      result = await client.getFailingTests();
      const newHash = hashTestState(result);

      if (newHash === lastHash) {
        stableCount++;
        if (stableCount >= 2) {
          // State has been stable, we're done
          break;
        }
      } else {
        // State changed, reset stability counter
        stableCount = 0;
        lastHash = newHash;
      }
    }

    // Report results
    if (result.tests.length === 0) {
      // Success - exit silently
      process.exit(0);
    }

    // Build error message
    const lines: string[] = [];
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push(`Wallaby: ${result.tests.length} failing test(s)`);
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("");

    for (const test of result.tests.slice(0, 5)) {
      const testName = test.name.join(" > ");
      const error = test.errors?.[0]?.message || "Unknown error";
      lines.push(`• ${test.file}:${test.line}`);
      lines.push(`  ${testName}`);
      lines.push(`  Error: ${error.slice(0, 100)}`);
      lines.push("");
    }

    if (result.tests.length > 5) {
      lines.push(`... and ${result.tests.length - 5} more`);
      lines.push("");
    }

    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const errorMessage = lines.join("\n");

    // Output JSON for Claude Code hook system
    const output = { decision: "block", reason: errorMessage, systemMessage: errorMessage };
    console.log(JSON.stringify(output));

    process.exit(0);
  } finally {
    client.kill();
  }
}

main().catch((err) => {
  console.error("Wallaby check failed:", err.message);
  process.exit(1);
});
