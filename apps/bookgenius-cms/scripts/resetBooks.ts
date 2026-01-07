/**
 * Reset all book data from Convex.
 *
 * Usage:
 *   bun run scripts/resetBooks.ts
 *
 * This deletes:
 * - All notes
 * - All variants
 * - All folders, assets, versions from asset-manager
 *
 * Files in R2/storage are left orphaned (not deleted).
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { logError } from "../lib/utils";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
if (!CONVEX_URL) {
  console.error("Missing CONVEX_URL environment variable");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

async function main() {
  console.log("🗑️  Nuking all book data from Convex...\n");

  let totalNotes = 0;
  let totalVariants = 0;
  let totalFolders = 0;
  let totalAssets = 0;
  let totalVersions = 0;
  let totalEvents = 0;
  let totalIntents = 0;

  // Delete notes in batches
  process.stdout.write("Deleting notes");
  let hasMoreNotes = true;
  while (hasMoreNotes) {
    const result = await client.mutation(api.reset.deleteNotesBatch, {});
    totalNotes += result.deletedNotes;
    hasMoreNotes = result.hasMore;
    process.stdout.write(".");
  }
  console.log(` ${totalNotes}`);

  // Delete variants in batches
  process.stdout.write("Deleting variants");
  let hasMoreVariants = true;
  while (hasMoreVariants) {
    const result = await client.mutation(api.reset.deleteVariantsBatch, {});
    totalVariants += result.deletedVariants;
    hasMoreVariants = result.hasMore;
    process.stdout.write(".");
  }
  console.log(` ${totalVariants}`);

  // Delete asset-manager data in batches
  process.stdout.write("Deleting assets");
  let hasMoreAssets = true;
  while (hasMoreAssets) {
    const result = await client.mutation(api.reset.deleteAssetsBatch, {});
    totalFolders += result.deletedFolders;
    totalAssets += result.deletedAssets;
    totalVersions += result.deletedVersions;
    totalEvents += result.deletedEvents;
    totalIntents += result.deletedIntents;
    hasMoreAssets = result.hasMore;
    process.stdout.write(".");
  }
  console.log(" done");

  console.log("\nDeleted:");
  console.log(`  Notes: ${totalNotes}`);
  console.log(`  Variants: ${totalVariants}`);
  console.log(`  Folders: ${totalFolders}`);
  console.log(`  Assets: ${totalAssets}`);
  console.log(`  Versions: ${totalVersions}`);
  console.log(`  Events: ${totalEvents}`);
  console.log(`  Upload Intents: ${totalIntents}`);

  console.log("\n✅ Reset complete!");
}

main().catch((error) => {
  logError("Reset failed:", error);
  process.exit(1);
});
