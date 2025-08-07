import { rm, mkdir, stat, readdir, rename } from "node:fs/promises";
import path from "node:path";

// --- CONFIGURATION ---

const projectRoot = path.join(import.meta.dir, "..", "..");
const buildDir = path.join(projectRoot, "build");
const s3DataDir = path.join(buildDir, "s3-data", "assets");

// Define all applications that need to be processed
const apps = [
  {
    name: "player",
    sourceDir: path.join(projectRoot, "apps", "player", "dist"),
    booksSourceDir: path.join(projectRoot, "apps", "player", "docker-build", "books"),
    targetDir: path.join(buildDir, "player-app"),
  },
  { name: "platform", sourceDir: path.join(projectRoot, "apps", "platform", "dist"), targetDir: path.join(buildDir, "platform-app") },
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

    console.log("\n--- Handling special assets (books, embeddings, etc.) ---");
    await mkdir(s3DataDir, { recursive: true });

    // Move book assets from the player's dist directory to the S3 data directory
    const playerBooksDir = apps.find((app) => app.name === "player")!.booksSourceDir;
    if (await pathExists(playerBooksDir)) {
      const booksTarget = path.join(s3DataDir, "books");
      console.log(`[MOVE] Moving book assets: "${playerBooksDir}" -> "${booksTarget}"`);
      await copyDirectory(playerBooksDir, booksTarget);
    } else {
      console.log(`[SKIP] No 'books' directory found in player build output.`);
    }

    // TODO: Add logic here to copy/move embeddings if they are generated elsewhere
    // const embeddingsSourceDir = path.join(projectRoot, 'apps', 'embeddings-api', 'generated-data');
    // if (await pathExists(embeddingsSourceDir)) {
    //   console.log('Moving embeddings to s3-data...');
    //   await copyDirectory(embeddingsSourceDir, path.join(s3DataDir, 'embeddings'));
    // }

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

// Run the function
prepareBuild();
