import { processBook } from "./orchestrator";
import { processBookStructured } from "./orchestrator-structured";

const args = process.argv.slice(2);
const structured = args.includes("--structured");
const bookSlug = args.find((a) => !a.startsWith("--"));

if (!bookSlug) {
  console.error("Usage: bun apps/pipeline-agent/src/index.ts <book-slug> [--structured]");
  console.error("");
  console.error("Modes:");
  console.error("  (default)      Edit-based: agent makes surgical Edit tool calls");
  console.error(
    "  --structured   Fast mode: single API call returns JSON, applied algorithmically",
  );
  console.error("");
  console.error("Example: bun apps/pipeline-agent/src/index.ts the-maltese-falcon --structured");
  process.exit(1);
}

if (structured) {
  await processBookStructured(bookSlug);
} else {
  await processBook(bookSlug);
}
