#!/usr/bin/env node
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const bookDir = process.argv[2];
if (!bookDir) {
  console.error("Please provide a book directory name");
  process.exit(1);
}

const sourcePath = path.join(__dirname, "..", "public", bookDir);
const targetPath = path.join(sourcePath, "compiled");

// Create compiled directory
if (!fs.existsSync(targetPath)) {
  fs.mkdirSync(targetPath, { recursive: true });
}

// Get all TS files
const tsFiles = fs.readdirSync(sourcePath).filter((file) => file.endsWith(".ts"));

console.log(`Compiling ${tsFiles.length} TypeScript files for ${bookDir}...`);

// Compile each TS file to JS
tsFiles.forEach((file) => {
  const inputFile = path.join(sourcePath, file);
  const outputFile = path.join(targetPath, file.replace(".ts", ".js"));

  try {
    // Read the TypeScript file
    let content = fs.readFileSync(inputFile, "utf-8");

    // Remove type imports
    content = content.replace(/^import\s+type\s+.*from\s*['"].*['"];?\s*$/gm, "");

    // Remove @/ imports
    content = content.replace(/^import\s+.*from\s*['"]@\/.*['"];?\s*$/gm, "");

    // Transpile TypeScript to JavaScript
    const result = ts.transpileModule(content, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020, removeComments: true } });

    fs.writeFileSync(outputFile, result.outputText);
    console.log(`✓ Compiled ${file}`);
  } catch (error) {
    console.error(`✗ Failed to compile ${file}:`, error.message);
  }
});

console.log("Compilation complete!");
