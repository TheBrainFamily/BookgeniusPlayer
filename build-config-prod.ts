import * as esbuild from "esbuild";
import * as fs from "fs";

async function prepareBookFile(): Promise<void> {
  try {
    // Move original book.ts to temporary file
    fs.renameSync("./src/book.ts", "./src/book.ts.tmp");

    // Copy the book.js file to book.ts
    fs.copyFileSync("/Users/lukaszgandecki/projects/convert-books-trump/public/book.js", "./src/book.ts");

    // Replace first line to add export keyword
    const bookContent = fs.readFileSync("./src/book.ts", "utf8");
    const modifiedContent = bookContent.replace(/^const pagesContent/, "export const pagesContent");
    fs.writeFileSync("./src/book.ts", modifiedContent);

    console.log("✅ Book file prepared for build");
  } catch (error) {
    console.error("❌ Failed to prepare book file:", error);
    process.exit(1);
  }
}

async function restoreBookFile(): Promise<void> {
  try {
    // Restore original book.ts from temporary file
    fs.renameSync("./src/book.ts.tmp", "./src/book.ts");
    console.log("✅ Original book file restored");
  } catch (error) {
    console.error("❌ Failed to restore book file:", error);
    process.exit(1);
  }
}

async function runBuild(): Promise<void> {
  try {
    await prepareBookFile();
    await esbuild.build({
      entryPoints: ["./src/main.ts"],
      bundle: true,
      platform: "browser",
      sourcemap: true,
      outfile: "./dist/main.js",
      define: { "require.main": "undefined" },
    });
    await restoreBookFile();
    console.log("✅ Build completed successfully");
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

runBuild();
