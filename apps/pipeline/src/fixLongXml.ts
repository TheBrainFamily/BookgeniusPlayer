import { promises as fs } from "fs";
import * as path from "path";

interface Options {
  dryRun: boolean;
  verbose: boolean;
}

// Collect CLI arguments and split between options and file paths.
function parseArgs(argv: string[]): { files: string[]; options: Options } {
  const files: string[] = [];
  const options: Options = { dryRun: false, verbose: false };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      files.push(arg);
    }
  }

  if (files.length === 0) {
    printHelp();
    throw new Error("No input files provided.");
  }

  return { files, options };
}

function printHelp() {
  console.log(`Usage: ts-node src/fixLongXml.ts [options] <files...>

Options:
  --dry-run   Preview the formatted output without overwriting files
  --verbose   Report files that were reformatted
  -h, --help  Show this help message
`);
}

function formatChapterBlock(block: string): string {
  const match = block.match(/^<Chapter\b([^>]*)>([\s\S]*?)<\/Chapter>$/);
  if (!match) {
    return block;
  }

  const openTag = `<Chapter${match[1]}>`;
  const inner = match[2];
  const children = splitTopLevelElements(inner);

  if (children.length === 0) {
    return `${openTag}\n</Chapter>`;
  }

  const formattedChildren = children
    .map((child) => child.trim())
    .map((child) => child.replace(/\n/g, "\n  "))
    .map((child) => `  ${child}`)
    .join("\n");

  return `${openTag}\n${formattedChildren}\n</Chapter>`;
}

function splitTopLevelElements(inner: string): string[] {
  const children: string[] = [];
  let index = 0;
  const length = inner.length;

  while (index < length) {
    while (index < length && /\s/.test(inner[index])) {
      index += 1;
    }

    if (index >= length) {
      break;
    }

    if (inner.startsWith("<!--", index)) {
      const commentEnd = inner.indexOf("-->", index + 4);
      const end = commentEnd === -1 ? length : commentEnd + 3;
      children.push(inner.slice(index, end));
      index = end;
      continue;
    }

    if (inner.startsWith("<![CDATA[", index)) {
      const cdataEnd = inner.indexOf("]]>", index + 9);
      const end = cdataEnd === -1 ? length : cdataEnd + 3;
      children.push(inner.slice(index, end));
      index = end;
      continue;
    }

    if (inner.startsWith("<?", index)) {
      const piEnd = inner.indexOf("?>", index + 2);
      const end = piEnd === -1 ? length : piEnd + 2;
      children.push(inner.slice(index, end));
      index = end;
      continue;
    }

    if (inner[index] !== "<") {
      const start = index;
      while (index < length && inner[index] !== "<") {
        index += 1;
      }
      children.push(inner.slice(start, index));
      continue;
    }

    const start = index;
    let depth = 0;
    let sawTag = false;

    while (index < length) {
      if (inner.startsWith("<!--", index)) {
        const commentEnd = inner.indexOf("-->", index + 4);
        index = commentEnd === -1 ? length : commentEnd + 3;
        continue;
      }

      if (inner.startsWith("<![CDATA[", index)) {
        const cdataEnd = inner.indexOf("]]>", index + 9);
        index = cdataEnd === -1 ? length : cdataEnd + 3;
        continue;
      }

      if (inner.startsWith("<?", index)) {
        const piEnd = inner.indexOf("?>", index + 2);
        index = piEnd === -1 ? length : piEnd + 2;
        continue;
      }

      if (inner[index] !== "<") {
        index += 1;
        continue;
      }

      const tagEnd = inner.indexOf(">", index);
      if (tagEnd === -1) {
        index = length;
        break;
      }

      const tagContent = inner.slice(index + 1, tagEnd).trim();
      const isClosing = tagContent.startsWith("/");
      const isSelfClosing = /\/$/.test(tagContent);
      const isSpecial = tagContent.startsWith("!") || tagContent.startsWith("?");

      if (!isClosing && !isSelfClosing && !isSpecial) {
        depth += 1;
      }

      if (!isSpecial && !sawTag) {
        sawTag = true;
      }

      if (isClosing && depth > 0) {
        depth -= 1;
      }

      index = tagEnd + 1;

      if (sawTag && depth === 0 && (isClosing || isSelfClosing)) {
        break;
      }
    }

    children.push(inner.slice(start, index));
  }

  return children.filter((child) => child.trim().length > 0);
}

function formatChapters(xml: string): string {
  return xml.replace(/<Chapter\b[^>]*>[\s\S]*?<\/Chapter>/g, (chapter) => formatChapterBlock(chapter));
}

async function processFile(filePath: string, options: Options): Promise<boolean> {
  const absolutePath = path.resolve(filePath);
  const original = await fs.readFile(absolutePath, "utf-8");
  const formatted = formatChapters(original);

  if (formatted === original) {
    if (options.verbose) {
      console.log(`No change: ${filePath}`);
    }
    return false;
  }

  if (options.dryRun) {
    console.log(`--- ${filePath} (preview) ---\n${formatted}`);
    return true;
  }

  await fs.writeFile(absolutePath, formatted, "utf-8");
  if (options.verbose) {
    console.log(`Updated: ${filePath}`);
  }
  return true;
}

async function main() {
  try {
    const { files, options } = parseArgs(process.argv.slice(2));
    let changedCount = 0;

    for (const file of files) {
      const changed = await processFile(file, options);
      if (changed) {
        changedCount += 1;
      }
    }

    if (options.verbose) {
      console.log(`Files changed: ${changedCount}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}

export { formatChapters };
