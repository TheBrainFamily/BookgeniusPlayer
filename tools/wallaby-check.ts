#!/usr/bin/env bun
/**
 * Calls Wallaby MCP server to check for failing tests.
 * Used as a PostToolUse hook to get instant test feedback after code changes.
 */

import { spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";

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
  errors?: Array<{ message: string }>;
}

interface WallabyResult {
  tests: WallabyTest[];
  coveragePercentage: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callWallabyMcp(): Promise<void> {
  // Wait for Wallaby to process file changes before querying
  await sleep(500);

  const mcpPath = join(homedir(), ".wallaby", "mcp");

  const proc = spawn("node", [mcpPath], { stdio: ["pipe", "pipe", "pipe"] });

  let buffer = "";
  let requestId = 0;

  const sendRequest = (method: string, params?: Record<string, unknown>): number => {
    const id = ++requestId;
    const request: JsonRpcRequest = { jsonrpc: "2.0", method, params, id };
    proc.stdin.write(JSON.stringify(request) + "\n");
    return id;
  };

  const waitForResponse = (expectedId: number): Promise<JsonRpcResponse> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for MCP response"));
      }, 5000);

      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line) as JsonRpcResponse;
            if (response.id === expectedId) {
              clearTimeout(timeout);
              proc.stdout.off("data", onData);
              resolve(response);
            }
          } catch {
            // Ignore parse errors for non-JSON lines
          }
        }
      };

      proc.stdout.on("data", onData);
    });
  };

  try {
    // Initialize MCP connection
    const initId = sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "wallaby-check", version: "1.0.0" },
    });
    await waitForResponse(initId);

    // Send initialized notification (no response expected)
    proc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );

    // Call the failing tests tool
    const toolId = sendRequest("tools/call", { name: "wallaby_failingTests", arguments: {} });
    const toolResponse = await waitForResponse(toolId);

    if (toolResponse.error) {
      console.error(`Wallaby error: ${toolResponse.error.message}`);
      process.exit(1);
    }

    // Parse the result
    const content = toolResponse.result as { content: Array<{ type: string; text: string }> };
    if (content?.content?.[0]?.text) {
      const result = JSON.parse(content.content[0].text) as WallabyResult;

      if (result.tests.length === 0) {
        // Success - exit silently
        process.exit(0);
      } else {
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

        // Exit 0 so JSON is processed (exit 1 would ignore the JSON)
        process.exit(0);
      }
    }
  } finally {
    proc.kill();
  }
}

callWallabyMcp().catch((err) => {
  console.error("Wallaby check failed:", err.message);
  process.exit(1);
});
