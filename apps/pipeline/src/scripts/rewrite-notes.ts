import fs from "fs";
import path from "path";

export const rewriteNotes = (input: string) => {
  return input.replace(/href="#fn(\d+)"/g, 'data-note="$1"');
};

type Args = { inputDir: string; outputDir: string; dryRun: boolean };

function resolvePath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: bun apps/pipeline/src/scripts/rewrite-notes.ts <input-dir> <output-dir> [--dry-run]",
    );
    process.exit(1);
  }

  return {
    inputDir: resolvePath(args[0]),
    outputDir: resolvePath(args[1]),
    dryRun: args.includes("--dry-run"),
  };
}

function listHtmlFiles(inputDir: string): string[] {
  return fs.readdirSync(inputDir).filter((file) => file.toLowerCase().endsWith(".html"));
}

async function main() {
  const { inputDir, outputDir, dryRun } = parseArgs();

  if (!fs.existsSync(inputDir)) {
    console.error(`Directory not found: ${inputDir}`);
    process.exit(1);
  }

  const files = listHtmlFiles(inputDir);
  if (files.length === 0) {
    console.log(`No .html files found in ${inputDir}`);
    return;
  }

  if (!dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let processed = 0;
  let changed = 0;

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file);
    const original = fs.readFileSync(inputPath, "utf8");
    const rewritten = rewriteNotes(original);

    processed += 1;
    if (rewritten !== original) {
      changed += 1;
    }

    if (dryRun) {
      continue;
    }

    fs.writeFileSync(outputPath, rewritten, "utf8");
  }

  console.log(
    `Done. Processed: ${processed}, changed: ${changed}, unchanged: ${processed - changed}`,
  );
  if (dryRun) {
    console.log("Dry run enabled: no files were written.");
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
