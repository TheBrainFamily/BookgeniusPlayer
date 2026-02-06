#!/usr/bin/env bun
import path from "path";
import dotenv from "dotenv";
import { parseArgs } from "node:util";
import { startPipeline } from "./pipeline";

dotenv.config({ path: path.resolve(import.meta.dir, "..", "..", ".env") });

async function runOneBook(slug: string) {
  const job = await startPipeline({ slug });

  let lastLogIndex = 0;
  while (true) {
    const logs = job.logs || [];
    if (logs.length > lastLogIndex) {
      for (let i = lastLogIndex; i < logs.length; i += 1) {
        console.log(logs[i]);
      }
      lastLogIndex = logs.length;
    }

    if (job.status === "done") {
      console.log(`[queue-pipeline-runner] ✔ ${slug} done`);
      return 0;
    }

    if (job.status === "error") {
      const message = job.error || "Unknown pipeline error";
      console.error(`[queue-pipeline-runner] ✖ ${slug} failed: ${message}`);
      return 1;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { slug: { type: "string" }, help: { type: "boolean", short: "h" } },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    console.log("Usage: bun src/server/queue-pipeline-runner.ts --slug <book-slug>");
    process.exit(0);
  }

  const slug = values.slug;
  if (!slug) {
    console.error("Missing required argument: --slug");
    console.error("Usage: bun src/server/queue-pipeline-runner.ts --slug <book-slug>");
    process.exit(1);
  }

  const exitCode = await runOneBook(slug);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[queue-pipeline-runner] Fatal error", err);
  process.exit(1);
});
