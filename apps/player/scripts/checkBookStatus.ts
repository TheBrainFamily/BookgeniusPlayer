#!/usr/bin/env tsx

// Comprehensive book status checker that runs all existing asset check scripts
// Usage: tsx checkBookStatus.ts <book-name>
// Example: tsx checkBookStatus.ts 1984

import { execSync } from "child_process";

interface BookStatus {
  bookName: string;
  characterAssets: { status: "success" | "error"; output: string };
  backgroundAssets: { status: "success" | "error"; output: string };
  backgroundSongs: { status: "success" | "error"; output: string };
}

function runScript(
  scriptName: string,
  bookPath: string,
): { status: "success" | "error"; output: string } {
  try {
    const output = execSync(`npx tsx scripts/${scriptName}.ts ${bookPath}`, {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    return { status: "success", output };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorOutput =
      (error as { stdout?: string })?.stdout || errorMessage || "Unknown error occurred";
    return { status: "error", output: errorOutput };
  }
}

function checkBookStatus(bookPath: string): BookStatus {
  console.log(`\n🔍 Checking book status for: ${bookPath}`);
  console.log("=".repeat(80));

  // Run character assets check
  console.log("\n📖 Checking character assets...");
  const characterAssets = runScript("check-character-assets", bookPath);

  // Run background assets check
  console.log("\n🎬 Checking background & cut scene assets...");
  const backgroundAssets = runScript("check-background-assets", bookPath);

  // Run background songs check
  console.log("\n🎵 Checking background songs...");
  const backgroundSongs = runScript("check-background-songs", bookPath);

  return {
    bookName: bookPath.split("/").pop() || bookPath,
    characterAssets,
    backgroundAssets,
    backgroundSongs,
  };
}

function printBookStatus(status: BookStatus): void {
  console.log("\n" + "=".repeat(80));
  console.log(`📚 BOOK STATUS SUMMARY: ${status.bookName.toUpperCase()}`);
  console.log("=".repeat(80));

  // Character assets summary
  console.log(`\n👥 CHARACTER ASSETS:`);
  if (status.characterAssets.status === "success") {
    console.log("   ✅ Check completed successfully");
    // Extract key information from output
    const output = status.characterAssets.output;
    if (output.includes("✅ All character assets are complete")) {
      console.log("   🎉 All character assets are complete!");
    } else if (output.includes("❌ Incomplete character assets")) {
      console.log("   ⚠️  Some character assets are incomplete");
    }
  } else {
    console.log("   ❌ Check failed");
    console.log(`   Error: ${status.characterAssets.output}`);
  }

  // Background assets summary
  console.log(`\n🎬 BACKGROUND & CUT SCENE ASSETS:`);
  if (status.backgroundAssets.status === "success") {
    console.log("   ✅ Check completed successfully");
    const output = status.backgroundAssets.output;
    if (output.includes("✅ All media assets are present with correct dimensions")) {
      console.log("   🎉 All media assets are complete!");
    } else if (output.includes("❌ Missing MP4 Files") || output.includes("⚠️  Dimension Issues")) {
      console.log("   ⚠️  Some media assets have issues");
    }
  } else {
    console.log("   ❌ Check failed");
    console.log(`   Error: ${status.backgroundAssets.output}`);
  }

  // Background songs summary
  console.log(`\n🎵 BACKGROUND SONGS:`);
  if (status.backgroundSongs.status === "success") {
    console.log("   ✅ Check completed successfully");
    const output = status.backgroundSongs.output;
    if (output.includes("✅ All background songs are present with complete metadata")) {
      console.log("   🎉 All background songs are complete!");
    } else if (
      output.includes("❌ Missing MP3 Files") ||
      output.includes("⚠️  No Title") ||
      output.includes("⚠️  No Cover Art")
    ) {
      console.log("   ⚠️  Some background songs have issues");
    }
  } else {
    console.log("   ❌ Check failed");
    console.log(`   Error: ${status.backgroundSongs.output}`);
  }

  // Overall assessment
  console.log(`\n💡 OVERALL ASSESSMENT:`);
  const allSuccessful =
    status.characterAssets.status === "success" &&
    status.backgroundAssets.status === "success" &&
    status.backgroundSongs.status === "success";

  if (allSuccessful) {
    console.log("   🎉 All asset checks completed successfully!");
    console.log("   📊 Check the detailed output above for specific results.");
  } else {
    console.log("   ⚠️  Some asset checks failed or encountered issues.");
    console.log("   🔍 Review the error messages above for details.");
  }

  console.log("\n" + "=".repeat(80));
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: tsx checkBookStatus.ts <book-name>");
    console.error("Example: tsx checkBookStatus.ts 1984");
    process.exit(1);
  }

  const bookPath = args[0];

  try {
    const status = checkBookStatus(bookPath);
    printBookStatus(status);

    // Show detailed output for each check
    console.log("\n📋 DETAILED RESULTS:");
    console.log("=".repeat(80));

    console.log("\n👥 CHARACTER ASSETS DETAILS:");
    console.log(status.characterAssets.output);

    console.log("\n🎬 BACKGROUND ASSETS DETAILS:");
    console.log(status.backgroundAssets.output);

    console.log("\n🎵 BACKGROUND SONGS DETAILS:");
    console.log(status.backgroundSongs.output);
  } catch (error) {
    console.error(`❌ Error checking book status: ${error}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
