#!/usr/bin/env bun
import fs from "fs";
import path from "path";

type Args = { sourceRoot: string; slugs: string[]; limit: number };

const HTML_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "audio",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "i",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "link",
  "main",
  "map",
  "mark",
  "meta",
  "meter",
  "nav",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "param",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "section",
  "select",
  "small",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
]);

function resolvePath(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", inputPath.slice(2));
  }
  return path.resolve(inputPath);
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const slugsIdx = args.indexOf("--slugs");
  const limitIdx = args.indexOf("--limit");

  const repoRoot = path.resolve(process.cwd());
  const defaultSource = path.join(repoRoot, "ConvexAssets", "books");

  const sourceRoot = resolvePath(sourceIdx !== -1 ? args[sourceIdx + 1] : defaultSource);
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 5;

  let slugs: string[] = [];
  if (slugsIdx !== -1) {
    slugs = args[slugsIdx + 1]?.split(",").map((slug) => slug.trim()) ?? [];
  } else {
    slugs = fs
      .readdirSync(sourceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  return { sourceRoot, slugs, limit };
}

function listHtmlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith(".html"))
    .map((file) => path.join(dir, file));
}

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function main() {
  const { sourceRoot, slugs, limit } = parseArgs();
  const regex = /<\s*([A-Za-z][A-Za-z0-9-]*)\b/g;
  const ignoredTags = new Set(["hgroup"]);

  const missing: string[] = [];
  const tagCounts = new Map<string, number>();
  const tagSamples = new Map<string, Array<{ file: string; snippet: string }>>();

  let totalFiles = 0;
  let scannedSlugs = 0;

  for (const slug of slugs) {
    const chaptersDir = path.join(sourceRoot, slug, "chapters-source");
    const files = listHtmlFiles(chaptersDir);
    if (files.length === 0) {
      missing.push(slug);
      continue;
    }

    scannedSlugs += 1;
    totalFiles += files.length;

    for (const file of files) {
      const text = fs.readFileSync(file, "utf-8");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text))) {
        const tag = match[1].toLowerCase();
        if (HTML_TAGS.has(tag) || ignoredTags.has(tag)) continue;

        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

        const samples = tagSamples.get(tag) ?? [];
        if (samples.length < limit) {
          const start = Math.max(0, match.index - 120);
          const end = Math.min(text.length, match.index + 200);
          samples.push({ file, snippet: normalizeSnippet(text.slice(start, end)) });
          tagSamples.set(tag, samples);
        }
      }
    }
  }

  console.log(`Scanned ${totalFiles} file(s) across ${scannedSlugs} slug(s).`);
  if (missing.length > 0) {
    console.log(`Skipped ${missing.length} slug(s) without chapters-source:`);
    console.log(missing.join(", "));
  }

  if (tagCounts.size === 0) {
    console.log("No non-HTML tags found.");
    return;
  }

  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`Found ${sortedTags.length} non-HTML tag(s):`);
  for (const [tag, count] of sortedTags) {
    console.log(`- <${tag}> (${count} match(es))`);
    const samples = tagSamples.get(tag) ?? [];
    for (const sample of samples) {
      console.log(`  ${sample.file}`);
      console.log(`  ${sample.snippet}`);
    }
  }
}

if (require.main === module) {
  main();
}
