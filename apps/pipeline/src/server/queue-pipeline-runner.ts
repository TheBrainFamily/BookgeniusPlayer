#!/usr/bin/env bun
import path from "path";
import dotenv from "dotenv";
import { parseArgs } from "node:util";
import { startPipeline } from "./pipeline";
import { readProgress, isValidStep } from "./pipeline-progress";
import { type Step } from "../shared/pipelineTypes";

dotenv.config({ path: path.resolve(import.meta.dir, "..", "..", ".env") });

async function runOneBook(slug: string, onlyStep?: Step) {
  const progress = onlyStep ? readProgress(slug) : null;
  const completedSteps =
    progress && onlyStep
      ? Object.entries(progress.completedSteps)
          .filter(([, value]) => value.status === "done")
          .map(([step]) => step as Step)
      : undefined;

  const job = await startPipeline({ slug, onlyStep, completedSteps });

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
    options: {
      slug: { type: "string" },
      "only-step": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    console.log(
      "Usage: bun src/server/queue-pipeline-runner.ts --slug <book-slug> [--only-step <step>]",
    );
    process.exit(0);
  }

  const slug = values.slug;
  if (!slug) {
    console.error("Missing required argument: --slug");
    console.error(
      "Usage: bun src/server/queue-pipeline-runner.ts --slug <book-slug> [--only-step <step>]",
    );
    process.exit(1);
  }

  const onlyStepRaw = values["only-step"];
  if (onlyStepRaw && !isValidStep(onlyStepRaw)) {
    console.error(`Invalid step slug: ${onlyStepRaw}`);
    process.exit(1);
  }

  const exitCode = await runOneBook(slug, onlyStepRaw as Step | undefined);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[queue-pipeline-runner] Fatal error", err);
  process.exit(1);
});
