import * as esbuild from "esbuild";
import fs from "fs-extra";
import path from "path";

async function runBuild(): Promise<void> {
  try {
    await esbuild.build({
      entryPoints: ["src/services/answer-server/answer-server.ts"],
      bundle: true,
      external: ["express"], // leave Express out
      platform: "node",
      target: "node20",
      sourcemap: true,
      outfile: "build-answer-server/server.js",
    });

    console.log("✅ Build completed successfully");
    const buildDir = path.resolve("build-answer-server");
    await fs.ensureDir(buildDir);

    const pemSourceDir = path.resolve("src/services/answer-server");
    const pemFiles = ["jwt-public-key.pem", "snapplify-jwt-public-key.pem"];
    for (const filename of pemFiles) {
      const sourcePath = path.join(pemSourceDir, filename);
      const destinationPath = path.join(buildDir, filename);
      const exists = await fs.pathExists(sourcePath);
      if (!exists) {
        throw new Error(`Missing required PEM file at ${sourcePath}`);
      }
      await fs.copy(sourcePath, destinationPath);
      console.log(`📄 Copied ${filename} to build output`);
    }

    await fs.copy(path.resolve("package-build-answer.json"), path.resolve(buildDir, "package.json"));

    await fs.ensureDir(path.resolve("build-answer-server/books-data"));

    const booksDataDir = path.resolve("books-data");
    const outputBooksDataDir = path.resolve("build-answer-server/books-data");

    if (await fs.pathExists(booksDataDir)) {
      const bookSlugs = await fs.readdir(booksDataDir);
      for (const bookSlug of bookSlugs) {
        const embeddingsSrc = path.join(booksDataDir, bookSlug, "temporary-output", "embeddings.json");
        const textSrc = path.join(booksDataDir, bookSlug, "input", "rich.xml");
        const embeddingsDestDir = path.join(outputBooksDataDir, bookSlug);
        const embeddingsDest = path.join(embeddingsDestDir, "embeddings.json");
        const textDest = path.join(embeddingsDestDir, "rich.xml");
        if (await fs.pathExists(embeddingsSrc)) {
          await fs.ensureDir(embeddingsDestDir);
          await fs.copy(embeddingsSrc, embeddingsDest);
          await fs.copy(textSrc, textDest);
        }
      }
    }
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

runBuild();
