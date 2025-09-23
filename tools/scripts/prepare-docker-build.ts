import { rm, mkdir, stat, readdir, rename } from "node:fs/promises";
import path from "node:path";

// --- CONFIGURATION ---

const projectRoot = path.join(import.meta.dir, "..", "..");
const buildDir = path.join(projectRoot, "build");
const s3DataDir = path.join(buildDir, "s3-data"); // We'll put versions.json here
const s3AssetsDir = path.join(s3DataDir, "assets");

const apps = [
  {
    name: "player",
    sourceDir: path.join(projectRoot, "apps", "player", "dist"),
    booksSourceDir: path.join(projectRoot, "apps", "player", "docker-build", "books"),
    targetDir: path.join(buildDir, "player-app"),
  },
  { name: "platform-intl", sourceDir: path.join(projectRoot, "apps", "platform", "dist-intl"), targetDir: path.join(buildDir, "platform-app-intl") },
  { name: "platform-snapplify", sourceDir: path.join(projectRoot, "apps", "platform", "dist-snapplify"), targetDir: path.join(buildDir, "platform-app-snapplify") },
  { name: "platform-bookgeniusz", sourceDir: path.join(projectRoot, "apps", "platform", "dist"), targetDir: path.join(buildDir, "platform-app") },
  { name: "wukong", sourceDir: path.join(projectRoot, "apps", "wukong", "dist"), targetDir: path.join(buildDir, "wukong-app") },
];

// --- HELPER FUNCTIONS (unchanged) ---

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      const file = Bun.file(srcPath);
      await Bun.write(destPath, file);
    }
  }
}

async function prepareBuild() {
  try {
    console.log("--- Cleaning previous build directory ---");
    if (await pathExists(buildDir)) {
      await rm(buildDir, { recursive: true, force: true });
    }
    await mkdir(buildDir, { recursive: true });
    await mkdir(s3AssetsDir, { recursive: true });

    // --- NEW: Versioning Logic ---
    // Generate a unique, timestamp-based version string for this build run.
    const buildVersion = "v" + new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);
    console.log(`\n--- Generated build version: ${buildVersion} ---`);
    const versionsManifest: Record<string, string> = {};

    console.log("\n--- Handling and versioning book assets ---");
    const playerBooksDir = apps.find((app) => app.name === "player")!.booksSourceDir;
    if (await pathExists(playerBooksDir)) {
      const bookSlugs = await readdir(playerBooksDir);
      await Promise.all(
        bookSlugs.map(async (bookSlug) => {
          const sourceBookPath = path.join(playerBooksDir, bookSlug);

          // NEW: Create a versioned path for each book.
          const versionedBookTarget = path.join(s3AssetsDir, "books", bookSlug, buildVersion);

          console.log(`[VERSIONING] Moving '${bookSlug}' assets to: "${versionedBookTarget}"`);
          await copyDirectory(sourceBookPath, versionedBookTarget);

          // NEW: Record the new version for this book in our manifest.
          versionsManifest[bookSlug] = buildVersion;
        }),
      );
    } else {
      console.log(`[SKIP] No 'books' directory found to version.`);
    }

    // NEW: Write the versions.json file to the root of our S3 data.
    const versionsFilePath = path.join(s3DataDir, "versions.json");
    await Bun.write(versionsFilePath, JSON.stringify(versionsManifest, null, 2));
    console.log(`[MANIFEST] Created versions manifest at: "${versionsFilePath}"`);

    console.log("\n--- Processing and copying application artifacts ---");
    for (const app of apps) {
      if (await pathExists(app.sourceDir)) {
        console.log(`[COPY] Copying '${app.name}' app from "${app.sourceDir}" -> "${app.targetDir}"`);
        await copyDirectory(app.sourceDir, app.targetDir);
      } else {
        console.warn(`[WARN] Source directory for '${app.name}' not found, skipping: "${app.sourceDir}"`);
      }
    }

    console.log("✅ Docker artifacts preparation finished!");
  } catch (error) {
    console.error("❌ Error during build preparation:", error);
    process.exit(1);
  }
}

prepareBuild();
