import * as esbuild from "esbuild";

async function runBuild(): Promise<void> {
  try {
    await esbuild.build({
      entryPoints: ["./src/main.ts"],
      bundle: true,
      platform: "browser",
      sourcemap: true,
      outfile: "./dist/main.js",
      define: { "require.main": "undefined" },
    });
    console.log("✅ Build completed successfully");
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

runBuild();
