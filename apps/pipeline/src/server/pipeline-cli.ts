#!/usr/bin/env tsx
import path from "path";
import fs from "fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import dotenv from "dotenv";
import { startPipeline } from "./pipeline";

dotenv.config();

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("bookgenius-pipeline")
    .usage("$0 <fb2> [--slug my-book]")
    .positional("fb2", { describe: "Path to an .fb2 file", type: "string" })
    .option("slug", { type: "string", describe: "Slug for the book (defaults to fb2 filename)" })
    .demandCommand(1)
    .help()
    .parse();

  const fb2Path = path.resolve(String(argv._[0]));
  if (!fs.existsSync(fb2Path)) {
    console.error(`FB2 file not found: ${fb2Path}`);
    process.exit(1);
  }

  const baseName = path.basename(fb2Path, path.extname(fb2Path));
  const slug = argv.slug ? slugify(argv.slug) : slugify(baseName);

  console.log(`Starting pipeline for slug="${slug}" using FB2: ${fb2Path}`);

  const job = await startPipeline({ fb2Path, slug });

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
      console.log("Pipeline completed successfully.");
      if (job.packagePath) console.log(`Package: ${job.packagePath}`);
      process.exit(0);
    }
    if (job.status === "error") {
      clearInterval(poll);
      console.error("Pipeline failed:", job.error || "Unknown error");
      process.exit(1);
    }
  }, 1000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
