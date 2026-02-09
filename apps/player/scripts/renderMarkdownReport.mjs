#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";

function usage() {
  console.log(
    "Usage: node apps/player/scripts/renderMarkdownReport.mjs <input.md> <output.html> [--title \"Custom Title\"]",
  );
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractText(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(extractText).join("");
  if (value && typeof value === "object" && "props" in value) {
    return extractText(value.props?.children);
  }
  return "";
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 2) {
    usage();
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  const outputPath = path.resolve(args[1]);
  let customTitle;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--title" && args[i + 1]) {
      customTitle = args[i + 1];
      i++;
    }
  }
  return { inputPath, outputPath, customTitle };
}

function collectHeadings(markdown) {
  const headings = [];
  const slugCounts = new Map();
  const lines = markdown.split("\n");
  let inCode = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    const level = m[1].length;
    if (level < 2 || level > 4) continue;
    const text = m[2].trim();
    const base = slugify(text);
    const count = slugCounts.get(base) ?? 0;
    slugCounts.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    headings.push({ level, text, id });
  }

  return headings;
}

function renderHtml({ title, markdown, toc }) {
  const headingSlugCounts = new Map();

  const makeHeading =
    (tag) =>
    ({ children, ...props }) => {
      const text = extractText(children).trim() || tag;
      const base = slugify(text);
      const count = headingSlugCounts.get(base) ?? 0;
      headingSlugCounts.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count + 1}`;
      return React.createElement(tag, { ...props, id }, children);
    };

  const articleHtml = renderToStaticMarkup(
    React.createElement(ReactMarkdown, {
      components: {
        h2: makeHeading("h2"),
        h3: makeHeading("h3"),
        h4: makeHeading("h4"),
      },
      children: markdown,
    }),
  );

  const tocLinks = toc
    .map(
      (item) =>
        `<a class="toc-link lvl-${item.level}" href="#${item.id}">${escapeHtml(item.text)}</a>`,
    )
    .join("");

  const now = new Date();
  const generatedAt = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 8)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #f4f5f7;
      --paper: #ffffff;
      --ink: #1b1f24;
      --muted: #5d6773;
      --line: #d7dce3;
      --accent: #174ea6;
      --accent-soft: #e8f0fe;
      --code-bg: #111827;
      --code-ink: #e5e7eb;
      --shadow: 0 10px 30px rgba(25, 34, 54, 0.09);
      --radius: 14px;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: radial-gradient(1200px 600px at 25% -10%, #dde7fb 0, var(--bg) 60%);
      color: var(--ink);
      font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      line-height: 1.62;
    }

    .shell {
      max-width: 1360px;
      margin: 0 auto;
      padding: 28px 20px 44px;
    }

    .header {
      background: linear-gradient(130deg, #0f285a 0%, #153a83 70%, #1950b4 100%);
      color: #fff;
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 24px 26px;
      margin-bottom: 22px;
    }

    .header h1 {
      margin: 0;
      font-size: clamp(1.45rem, 2.2vw, 2rem);
      line-height: 1.2;
      letter-spacing: 0.01em;
    }

    .header p {
      margin: 10px 0 0;
      opacity: 0.9;
      font-size: 0.95rem;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
      gap: 18px;
      align-items: start;
    }

    .toc {
      position: sticky;
      top: 16px;
      max-height: calc(100vh - 34px);
      overflow: auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 14px 12px;
    }

    .toc h2 {
      margin: 3px 8px 10px;
      font-size: 0.95rem;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      color: var(--muted);
    }

    .toc-link {
      display: block;
      text-decoration: none;
      color: #243042;
      border-radius: 8px;
      padding: 6px 8px;
      margin-bottom: 3px;
      font-size: 0.88rem;
      line-height: 1.3;
    }

    .toc-link:hover {
      background: var(--accent-soft);
      color: var(--accent);
    }

    .toc-link.lvl-3 { padding-left: 16px; font-size: 0.84rem; color: #415268; }
    .toc-link.lvl-4 { padding-left: 24px; font-size: 0.81rem; color: #576880; }

    .paper {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: clamp(16px, 2vw, 30px);
      overflow-wrap: anywhere;
    }

    .paper :is(h1, h2, h3, h4) {
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", serif;
      line-height: 1.25;
      color: #0f1f3d;
      scroll-margin-top: 16px;
    }

    .paper h1 { margin: 0 0 0.9rem; font-size: clamp(1.5rem, 2.3vw, 2rem); }
    .paper h2 {
      margin-top: 1.8rem;
      margin-bottom: 0.6rem;
      font-size: clamp(1.16rem, 1.8vw, 1.45rem);
      border-top: 1px solid #edf0f5;
      padding-top: 1rem;
    }
    .paper h3 { margin-top: 1.15rem; margin-bottom: 0.4rem; font-size: 1.05rem; }
    .paper h4 { margin-top: 0.95rem; margin-bottom: 0.28rem; font-size: 0.98rem; }

    .paper p { margin: 0.6rem 0 0.72rem; color: #1b2432; }
    .paper ul, .paper ol { margin: 0.45rem 0 0.85rem 1.2rem; padding: 0; }
    .paper li { margin: 0.2rem 0; }
    .paper hr { border: 0; border-top: 1px solid #e5e9f0; margin: 1.2rem 0; }

    .paper code {
      font-family: "SF Mono", "Menlo", "Consolas", monospace;
      background: #f0f3f8;
      border: 1px solid #e0e6ef;
      border-radius: 6px;
      padding: 0.08rem 0.36rem;
      font-size: 0.9em;
    }

    .paper pre {
      margin: 0.85rem 0 1rem;
      background: var(--code-bg);
      color: var(--code-ink);
      border-radius: 10px;
      padding: 0.9rem 1rem;
      overflow: auto;
      border: 1px solid #1f2937;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
    }

    .paper pre code {
      background: transparent;
      border: none;
      color: inherit;
      padding: 0;
      font-size: 0.88rem;
    }

    .paper a { color: var(--accent); text-decoration: none; }
    .paper a:hover { text-decoration: underline; }

    @media (max-width: 1040px) {
      .layout { grid-template-columns: 1fr; }
      .toc { position: relative; top: 0; max-height: none; }
    }

    @media print {
      body { background: #fff; }
      .shell { max-width: none; margin: 0; padding: 0; }
      .header { box-shadow: none; border: 1px solid #ccc; }
      .layout { display: block; }
      .toc { display: none; }
      .paper {
        box-shadow: none;
        border: none;
        border-radius: 0;
        padding: 0;
      }
      .paper h2 { break-after: avoid-page; }
      .paper pre { white-space: pre-wrap; overflow: visible; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="header">
      <h1>${escapeHtml(title)}</h1>
      <p>Generated ${escapeHtml(generatedAt)} • standalone HTML</p>
    </header>
    <main class="layout">
      <nav class="toc" aria-label="Table of contents">
        <h2>Contents</h2>
        ${tocLinks}
      </nav>
      <article class="paper">
        ${articleHtml}
      </article>
    </main>
  </div>
</body>
</html>`;
}

function main() {
  const { inputPath, outputPath, customTitle } = parseArgs(process.argv);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const markdown = fs.readFileSync(inputPath, "utf8");
  const titleLine = markdown.split("\n").find((l) => l.startsWith("# "));
  const defaultTitle = titleLine ? titleLine.replace(/^#\s+/, "").trim() : "Engineering Report";
  const title = customTitle || defaultTitle;
  const toc = collectHeadings(markdown);
  const html = renderHtml({ title, markdown, toc });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  console.log(`Rendered ${inputPath} -> ${outputPath}`);
}

main();
