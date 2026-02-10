import { afterEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CLI_PATH = path.resolve(import.meta.dir, "../src/cli.ts");
const TEMP_DIRS: string[] = [];

function run(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", env: process.env });
}

function runCli(args: string[], cwd: string): string {
  return run("bun", ["run", CLI_PATH, ...args], cwd);
}

function createRepoFixture(): { repoDir: string; targetFile: string } {
  const repoDir = mkdtempSync(path.join(tmpdir(), "codex-review-cli-"));
  TEMP_DIRS.push(repoDir);

  run("git", ["init"], repoDir);
  run("git", ["config", "user.email", "test@example.com"], repoDir);
  run("git", ["config", "user.name", "Codex Test"], repoDir);

  const appDir = path.join(repoDir, "apps/player/src");
  mkdirSync(appDir, { recursive: true });
  const targetFile = path.join(appDir, "review-target.ts");
  writeFileSync(targetFile, "export const value = 1;\n", "utf8");
  run("git", ["add", "."], repoDir);
  run("git", ["commit", "-m", "initial"], repoDir);

  writeFileSync(targetFile, "export const value = 2;\nexport const enabled = true;\n", "utf8");
  writeFileSync(path.join(appDir, "added.ts"), "export const added = true;\n", "utf8");

  return { repoDir, targetFile };
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    const dir = TEMP_DIRS.pop();
    if (!dir) {
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("cli integration", () => {
  it("start alias creates expected artifacts including session lock and agent brief", () => {
    const { repoDir } = createRepoFixture();
    const output = runCli(["start", "--workspace", repoDir], repoDir);
    expect(output).toContain("Generated review session");
    expect(existsSync(path.join(repoDir, ".codex-review", "review-plan.json"))).toBe(true);
    expect(existsSync(path.join(repoDir, ".codex-review", "chunk-narrations.json"))).toBe(true);
    expect(existsSync(path.join(repoDir, ".codex-review", "session-lock.json"))).toBe(true);
    expect(existsSync(path.join(repoDir, ".codex-review", "agent-brief.txt"))).toBe(true);
  });

  it("status reports pending files and detects drift after workspace changes", () => {
    const { repoDir, targetFile } = createRepoFixture();
    runCli(["start", "--workspace", repoDir], repoDir);

    const initialStatus = runCli(["status", "--workspace", repoDir, "--limit", "5"], repoDir);
    expect(initialStatus).toContain("Working tree since session: clean");
    expect(initialStatus).toContain("Files with pending narration:");
    expect(initialStatus).toContain("Next action:");

    writeFileSync(targetFile, "export const value = 3;\nexport const enabled = true;\n", "utf8");
    const changedStatus = runCli(["status", "--workspace", repoDir, "--limit", "5"], repoDir);
    expect(changedStatus).toContain("Working tree since session: changed");
  });

  it("supports narration aliases and shorthand aliases end-to-end", () => {
    const { repoDir } = createRepoFixture();
    runCli(["start", "--workspace", repoDir], repoDir);

    const chunksAliasOutput = runCli(
      [
        "chunks",
        "--workspace",
        repoDir,
        "--file",
        "apps/player/src/review-target.ts",
        "--limit",
        "3",
      ],
      repoDir,
    );
    expect(chunksAliasOutput).toContain('"items":');

    const listOutput = runCli(
      [
        "narration",
        "list",
        "--workspace",
        repoDir,
        "--file",
        "apps/player/src/review-target.ts",
        "--limit",
        "3",
      ],
      repoDir,
    );
    expect(listOutput).toContain('"items":');
    expect(listOutput).toContain("apps/player/src/review-target.ts");

    const narrationPath = path.join(repoDir, ".codex-review", "chunk-narrations.json");
    const narration = JSON.parse(readFileSync(narrationPath, "utf8")) as {
      chunkNarration: Array<{ chunkId: string; filePath: string; authored?: boolean }>;
    };
    const targetChunkId = narration.chunkNarration.find(
      (entry) => entry.filePath === "apps/player/src/review-target.ts",
    )?.chunkId;
    expect(targetChunkId).toBeDefined();
    if (!targetChunkId) {
      throw new Error("Expected a chunk for apps/player/src/review-target.ts");
    }

    const payload = JSON.stringify({
      ids: [targetChunkId],
      explanation: "Updated by integration test",
      reasoning: "Validate alias command",
      level: "mid",
      title: "Target file story",
      why: "Narrate this file first",
    });
    const setOutput = runCli(["set", "--workspace", repoDir, "--payload", payload], repoDir);
    expect(setOutput).toContain("Updated narration chunks: 1");

    const secondPayload = JSON.stringify({
      ids: [targetChunkId],
      explanation: "Updated by integration test v2",
      reasoning: "Validate narration setChunks alias",
    });
    const setAliasOutput = runCli(
      ["narration", "setChunks", "--workspace", repoDir, "--payload", secondPayload],
      repoDir,
    );
    expect(setAliasOutput).toContain("Updated narration chunks: 1");

    const updatedNarration = JSON.parse(readFileSync(narrationPath, "utf8")) as {
      chunkNarration: Array<{ chunkId: string; explanation: string; authored?: boolean }>;
    };
    const updated = updatedNarration.chunkNarration.find(
      (entry) => entry.chunkId === targetChunkId,
    );
    expect(updated?.explanation).toBe("Updated by integration test v2");
    expect(updated?.authored).toBe(true);
  });
});
