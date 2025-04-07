import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";

async function runBuild(): Promise<void> {
  try {
    // Build Trump book
    await esbuild.build({
      entryPoints: ["./src/main.ts"],
      bundle: true,
      platform: "browser",
      sourcemap: true,
      outfile: "./dist/main-trump.js",
      define: { "require.main": "undefined" },
      plugins: [
        {
          name: "alias-modules",
          setup(build) {
            // Redirect ./chapters import
            build.onResolve({ filter: /^\.\/chapters$/ }, () => {
              return { path: path.resolve("./src/chapters-trump.ts") };
            });
            // Redirect ./book import
            build.onResolve({ filter: /^\.\/book$/ }, () => {
              return { path: path.resolve("./src/book-trump.ts") };
            });
          },
        },
      ],
    });

    // Build Shorty book
    await esbuild.build({
      entryPoints: ["./src/main.ts"],
      bundle: true,
      platform: "browser",
      sourcemap: true,
      outfile: "./dist/main-shorty.js",
      define: { "require.main": "undefined" },
      plugins: [
        {
          name: "alias-modules",
          setup(build) {
            // Redirect ./chapters import
            build.onResolve({ filter: /^\.\/chapters$/ }, () => {
              return { path: path.resolve("./src/chapters-shorty.ts") };
            });
            // Redirect ./book import
            build.onResolve({ filter: /^\.\/book$/ }, () => {
              return { path: path.resolve("./src/book-shorty.ts") };
            });
          },
        },
      ],
    });

    // // Build Innocence book
    await esbuild.build({
      entryPoints: ["./src/main.ts"],
      bundle: true,
      platform: "browser",
      sourcemap: true,
      outfile: "./dist/main-innocence.js",
      define: { "require.main": "undefined" },
      plugins: [
        {
          name: "alias-modules",
          setup(build) {
            // Redirect ./chapters import
            build.onResolve({ filter: /^\.\/chapters$/ }, () => {
              return { path: path.resolve("./src/chapters-innocence.ts") };
            });
            // Redirect ./book import
            build.onResolve({ filter: /^\.\/book$/ }, () => {
              return { path: path.resolve("./src/book-innocence.ts") };
            });
          },
        },
      ],
    });

    // Read the source HTML file
    const sourceHtmlPath = path.resolve("./src/combined_book.html");
    const sourceHtml = fs.readFileSync(sourceHtmlPath, "utf8");

    // Create HTML files for each book with the correct script reference
    const books = ["trump", "innocence", "shorty"];

    for (const book of books) {
      // Replace main.js with main-{book}.js in the HTML content
      const modifiedHtml = sourceHtml.replace(/<script src="[^"]*main\.js"[^>]*><\/script>/, `<script src="/src-book/main-${book}.js"></script>`);

      // Write the modified HTML to the dist directory
      const outputPath = path.resolve(`./dist/${book}.html`);
      fs.writeFileSync(outputPath, modifiedHtml, "utf8");
      console.log(`✅ Created ${book}.html with main-${book}.js reference`);
    }

    console.log("✅ Build completed successfully");
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

runBuild();
