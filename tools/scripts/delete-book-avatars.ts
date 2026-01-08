import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

const bookSlug = process.argv[2];

if (!bookSlug) {
  console.error("Usage: bun tools/scripts/delete-book-avatars.ts <book-slug>");
  console.error("Example: bun tools/scripts/delete-book-avatars.ts a-a-milne_winnie-the-pooh");
  process.exit(1);
}

function convexRun(command: string, args: Record<string, unknown>): string {
  const argsJson = JSON.stringify(args);
  return execSync(`npx convex run ${command} '${argsJson}'`, { encoding: "utf-8", cwd: rootDir });
}

interface Folder {
  path: string;
  name: string;
}

async function main() {
  const bookPath = `books/${bookSlug}`;
  const charactersPath = `${bookPath}/characters`;

  console.log("");
  console.log("=========================================");
  console.log(`  DELETE AVATARS: ${bookSlug}`);
  console.log("=========================================");
  console.log("");

  console.log("Step 1/2: Getting character folders...");
  let folders: Folder[];
  try {
    const result = convexRun("cli:listFolders", { parentPath: charactersPath });
    folders = JSON.parse(result);
  } catch (err: unknown) {
    console.error(
      "Failed to get character folders:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  if (folders.length === 0) {
    console.log("No character folders found.");
    process.exit(0);
  }

  console.log(`Found ${folders.length} character folders.\n`);

  console.log("Step 2/2: Deleting avatar files...");
  let totalAssets = 0;
  let totalVersions = 0;

  for (const folder of folders) {
    try {
      const result = convexRun("admin/deleteFilesInFolder:deleteFilesInFolder", {
        folderPath: folder.path,
        basenames: ["avatar-large.png", "avatar.webp"],
      });
      const parsed = JSON.parse(result);
      if (parsed.deletedAssets > 0) {
        console.log(
          `  ${folder.name}: ${parsed.deletedAssets} assets, ${parsed.deletedVersions} versions`,
        );
        totalAssets += parsed.deletedAssets;
        totalVersions += parsed.deletedVersions;
      }
    } catch (err: unknown) {
      console.error(
        `  ${folder.name}: FAILED - ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log("");
  console.log("=========================================");
  console.log(`  DELETION COMPLETE`);
  console.log(`  Total: ${totalAssets} assets, ${totalVersions} versions`);
  console.log("=========================================");
  console.log("");
  console.log("You can now regenerate avatars with:");
  console.log(`  bun apps/pipeline/src/server/regenerate-missing-avatars.ts ${bookSlug}`);
}

main();
