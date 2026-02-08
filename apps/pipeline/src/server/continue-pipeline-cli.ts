#!/usr/bin/env tsx
import path from "path";
import fs from "fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import dotenv from "dotenv";
import { startPipeline } from "./pipeline";
import {
  readProgress,
  getNextStep,
  createRetroactiveProgress,
  isValidStep,
  getStepOrder,
} from "./pipeline-progress";
import { type Step, StepLabels } from "../shared/pipelineTypes";

dotenv.config();

function extractSlugFromPath(bookPath: string): string {
  // Extract slug from paths like "books-data/1765303791319-player-of-games" or just "1765303791319-player-of-games"
  const normalized = bookPath.replace(/\/$/, ""); // Remove trailing slash
  const parts = normalized.split("/");
  return parts[parts.length - 1];
}

function readCompletedSteps(slug: string): Step[] | undefined {
  const progress = readProgress(slug);
  if (!progress) return undefined;
  return Object.entries(progress.completedSteps)
    .filter(([, value]) => value.status === "done")
    .map(([step]) => step as Step);
}

function requireValidStep(step: string): Step {
  if (!isValidStep(step)) {
    console.error(`Error: Invalid step slug: ${step}`);
    console.error("Use --list-steps to see available step slugs");
    process.exit(1);
  }
  return step as Step;
}

function handleStatus(slug: string): void {
  const progress = readProgress(slug);
  if (!progress) {
    console.log(`No progress file found for ${slug}`);
    console.log("This book has not been processed with progress tracking yet.");
    return;
  }

  console.log(`Progress status for ${slug}:`);
  console.log(`  Started: ${progress.startedAt}`);
  console.log(`  Updated: ${progress.updatedAt}`);
  console.log(`  Last completed step: ${progress.lastCompletedStep || "none"}`);
  console.log(`  Last attempted step: ${progress.lastAttemptedStep || "none"}`);
  console.log("\nStep completion:");
  const stepOrder = getStepOrder();
  stepOrder.forEach((step) => {
    const stepProgress = progress.completedSteps[step];
    if (stepProgress) {
      const status = stepProgress.status === "done" ? "✔" : "✖";
      console.log(`  ${status} ${step} - ${StepLabels[step]}`);
    } else {
      console.log(`  ○ ${step} - ${StepLabels[step]}`);
    }
  });

  const nextStep = getNextStep(slug);
  if (nextStep) {
    console.log(`\nNext step to run: ${nextStep} (${StepLabels[nextStep]})`);
    return;
  }
  console.log("\nAll steps completed!");
}

function handleMarkCompleted(slug: string, bookFolder: string, markCompletedStep: string): void {
  const stepToMark = requireValidStep(markCompletedStep);
  console.log(`Creating retroactive progress for ${slug}`);
  console.log(`Marking steps up to and including "${stepToMark}" as completed`);
  const progress = createRetroactiveProgress(slug, stepToMark);
  console.log(
    `Progress file created at: books-data/${slug}/temporary-output/pipeline-progress.json`,
  );
  console.log(`\nCompleted steps:`);
  Object.keys(progress.completedSteps).forEach((step) => {
    console.log(`  ✔ ${step}`);
  });
  const nextStep = getNextStep(slug);
  if (!nextStep) return;

  console.log(`\nNext step to run: ${nextStep} (${StepLabels[nextStep]})`);
  console.log(`\nTo continue, run:`);
  console.log(`  npx tsx server/src/continue-pipeline-cli.ts ${bookFolder}`);
}

function resolveStepSelection(
  slug: string,
  options: { fromStepArg?: string; onlyStepArg?: string },
): { fromStep?: Step; onlyStep?: Step; completedSteps?: Step[] } {
  if (options.fromStepArg && options.onlyStepArg) {
    console.error("Error: --from-step and --only-step are mutually exclusive");
    process.exit(1);
  }

  if (options.onlyStepArg) {
    const onlyStep = requireValidStep(options.onlyStepArg);
    const completedSteps = readCompletedSteps(slug);
    console.log(`Running single step: ${onlyStep} (${StepLabels[onlyStep]})`);
    return { onlyStep, completedSteps };
  }

  if (options.fromStepArg) {
    const fromStep = requireValidStep(options.fromStepArg);
    console.log(`Starting from specified step: ${fromStep} (${StepLabels[fromStep]})`);
    return { fromStep };
  }

  const completedSteps = readCompletedSteps(slug);
  const fromStep = getNextStep(slug) || undefined;
  if (!fromStep) {
    console.log("All steps already completed. Nothing to do.");
    process.exit(0);
  }
  console.log(`Auto-detected next step: ${fromStep} (${StepLabels[fromStep]})`);
  return { fromStep, completedSteps };
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("continue-pipeline")
    .usage("$0 <book-folder> [options]")
    .positional("book-folder", {
      describe: "Path to book folder (e.g., books-data/1765303791319-player-of-games)",
      type: "string",
    })
    .option("from-step", {
      type: "string",
      describe: "Override auto-detect and start from this step",
    })
    .option("only-step", {
      type: "string",
      describe: "Run only this single step (fails if dependencies are not marked completed)",
    })
    .option("mark-completed", {
      type: "string",
      describe:
        "Create/update progress file marking all steps up to and including this step as completed",
    })
    .option("list-steps", { type: "boolean", describe: "List all available step slugs and exit" })
    .option("status", { type: "boolean", describe: "Show current progress status and exit" })
    .demandCommand(0)
    .help()
    .parse();

  // Handle --list-steps
  if (argv["list-steps"]) {
    console.log("Available step slugs:");
    const stepOrder = getStepOrder();
    stepOrder.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step} - ${StepLabels[step]}`);
    });
    process.exit(0);
  }

  const bookFolder = String(argv._[0] || "");
  if (!bookFolder) {
    console.error("Error: book-folder is required");
    console.error("Usage: npx tsx server/src/continue-pipeline-cli.ts <book-folder> [options]");
    console.error("Use --list-steps to see available step slugs");
    process.exit(1);
  }

  const slug = extractSlugFromPath(bookFolder);
  const repoRoot = path.resolve(__dirname, "../../");
  const bookRoot = path.join(repoRoot, "books-data", slug);

  if (!fs.existsSync(bookRoot)) {
    console.error(`Error: Book folder not found: ${bookRoot}`);
    process.exit(1);
  }

  // Handle --status
  if (argv.status) {
    handleStatus(slug);
    process.exit(0);
  }

  // Handle --mark-completed
  if (argv["mark-completed"]) {
    handleMarkCompleted(slug, bookFolder, argv["mark-completed"] as string);
    process.exit(0);
  }

  const { fromStep, onlyStep, completedSteps } = resolveStepSelection(slug, {
    fromStepArg: argv["from-step"] as string | undefined,
    onlyStepArg: argv["only-step"] as string | undefined,
  });

  const targetStep = onlyStep || fromStep;
  console.log(`\nContinuing pipeline for slug="${slug}" from step: ${targetStep}`);

  const job = await startPipeline({ slug, fromStep, onlyStep, completedSteps });

  // Poll job state and stream logs
  let lastLogIndex = 0;
  const poll = setInterval(() => {
    const logs = job.logs || [];
    if (logs.length > lastLogIndex) {
      for (let i = lastLogIndex; i < logs.length; i++) {
        console.log(logs[i]);
      }
      lastLogIndex = logs.length;
    }

    if (job.status === "done") {
      clearInterval(poll);
      console.log("\nPipeline completed successfully.");
      if (job.packagePath) console.log(`Package: ${job.packagePath}`);
      process.exit(0);
    }
    if (job.status === "error") {
      clearInterval(poll);
      console.error("\nPipeline failed:", job.error || "Unknown error");
      console.error("\nTo retry from the failed step, run:");
      console.error(`  npx tsx server/src/continue-pipeline-cli.ts ${bookFolder}`);
      process.exit(1);
    }
  }, 1000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
