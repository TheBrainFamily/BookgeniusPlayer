#!/usr/bin/env tsx
import path from "path";
import fs from "fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import dotenv from "dotenv";
import { startPipeline } from "./pipeline";
import { readProgress, getNextStep, createRetroactiveProgress, isValidStep, getStepOrder } from "./pipeline-progress";
import { Step, StepLabels } from "../shared/pipelineTypes";

dotenv.config();

function extractSlugFromPath(bookPath: string): string {
  // Extract slug from paths like "books-data/1765303791319-player-of-games" or just "1765303791319-player-of-games"
  const normalized = bookPath.replace(/\/$/, ""); // Remove trailing slash
  const parts = normalized.split("/");
  return parts[parts.length - 1];
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("continue-pipeline")
    .usage("$0 <book-folder> [options]")
    .positional("book-folder", {
      describe: "Path to book folder (e.g., books-data/1765303791319-player-of-games)",
      type: "string",
    })
    .option("from-step", { type: "string", describe: "Override auto-detect and start from this step" })
    .option("mark-completed", {
      type: "string",
      describe: "Create/update progress file marking all steps up to and including this step as completed",
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
    const progress = readProgress(slug);
    if (!progress) {
      console.log(`No progress file found for ${slug}`);
      console.log("This book has not been processed with progress tracking yet.");
    } else {
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
      } else {
        console.log("\nAll steps completed!");
      }
    }
    process.exit(0);
  }

  // Handle --mark-completed
  if (argv["mark-completed"]) {
    const stepToMark = argv["mark-completed"] as string;
    if (!isValidStep(stepToMark)) {
      console.error(`Error: Invalid step slug: ${stepToMark}`);
      console.error("Use --list-steps to see available step slugs");
      process.exit(1);
    }
    console.log(`Creating retroactive progress for ${slug}`);
    console.log(`Marking steps up to and including "${stepToMark}" as completed`);
    const progress = createRetroactiveProgress(slug, stepToMark as Step);
    console.log(`Progress file created at: books-data/${slug}/temporary-output/pipeline-progress.json`);
    console.log(`\nCompleted steps:`);
    Object.keys(progress.completedSteps).forEach((step) => {
      console.log(`  ✔ ${step}`);
    });
    const nextStep = getNextStep(slug);
    if (nextStep) {
      console.log(`\nNext step to run: ${nextStep} (${StepLabels[nextStep]})`);
      console.log(`\nTo continue, run:`);
      console.log(`  npx tsx server/src/continue-pipeline-cli.ts ${bookFolder}`);
    }
    process.exit(0);
  }

  // Determine which step to start from
  let fromStep: Step | undefined;

  if (argv["from-step"]) {
    const specifiedStep = argv["from-step"] as string;
    if (!isValidStep(specifiedStep)) {
      console.error(`Error: Invalid step slug: ${specifiedStep}`);
      console.error("Use --list-steps to see available step slugs");
      process.exit(1);
    }
    fromStep = specifiedStep as Step;
    console.log(`Starting from specified step: ${fromStep} (${StepLabels[fromStep]})`);
  } else {
    // Auto-detect from progress file
    fromStep = getNextStep(slug) || undefined;
    if (fromStep) {
      console.log(`Auto-detected next step: ${fromStep} (${StepLabels[fromStep]})`);
    } else {
      console.log("All steps already completed. Nothing to do.");
      process.exit(0);
    }
  }

  console.log(`\nContinuing pipeline for slug="${slug}" from step: ${fromStep}`);

  const job = await startPipeline({ slug, fromStep });

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
