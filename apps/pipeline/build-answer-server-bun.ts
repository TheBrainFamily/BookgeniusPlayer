import fs from "fs-extra";
import path from "path";

async function runBuild(): Promise<void> {
  const buildDir = path.resolve("build-answer-server");
  await fs.ensureDir(buildDir);

  const result = await Bun.build({ entrypoints: ["src/services/answer-server/answer-server.ts"], outdir: buildDir, target: "bun", sourcemap: "linked", minify: false });

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

  console.log("✅ Build complete!");
}

runBuild();
