import fs from "fs-extra";
import path from "path";

async function runBuild(): Promise<void> {
  const buildDir = path.resolve("build-answer-server");
  await fs.ensureDir(buildDir);

  const result = await Bun.build({
    entrypoints: ["src/services/answer-server/answer-server.ts"],
    outdir: buildDir,
    target: "bun",
    sourcemap: "linked",
    minify: false,
  });

  if (!result.success) {
    console.error("❌ Build failed:", result.logs);
    process.exit(1);
  }
  console.log("✅ Build completed successfully");

  const pemSourceDir = path.resolve("src/services/answer-server");
  for (const filename of ["jwt-public-key.pem", "snapplify-jwt-public-key.pem"]) {
    const sourcePath = path.join(pemSourceDir, filename);
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, path.join(buildDir, filename));
      console.log(`📄 Copied ${filename}`);
    }
  }

  await fs.copy("package-build-answer.json", path.join(buildDir, "package.json"));

  const booksDataDir = path.resolve("books-data");
  const outputBooksDataDir = path.resolve(buildDir, "books-data");
  await fs.ensureDir(outputBooksDataDir);

  if (await fs.pathExists(booksDataDir)) {
    const bookSlugs = await fs.readdir(booksDataDir);
    for (const bookSlug of bookSlugs) {
      const embeddingsSrc = path.join(booksDataDir, bookSlug, "temporary-output", "embeddings.json");
      const textSrc = path.join(booksDataDir, bookSlug, "input", "rich.xml");

      if (await fs.pathExists(embeddingsSrc)) {
        const destDir = path.join(outputBooksDataDir, bookSlug);
        await fs.ensureDir(destDir);
        await fs.copy(embeddingsSrc, path.join(destDir, "embeddings.json"));
        await fs.copy(textSrc, path.join(destDir, "rich.xml"));
        console.log(`📚 Copied ${bookSlug}`);
      }
    }
  }

  console.log("✅ Build complete!");
}

runBuild();
