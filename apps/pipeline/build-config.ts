import * as esbuild from "esbuild";

async function runBuild(): Promise<void> {
  try {
    await esbuild.build({
      entryPoints: ["src/server.ts"],
      bundle: true,
      platform: "node",
      target: "node16",
      sourcemap: true,
      outfile: "build/server.js",
      define: { "require.main": "undefined" },
    });
    console.log("✅ Build completed successfully");
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

runBuild();
