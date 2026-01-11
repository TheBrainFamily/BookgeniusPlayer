#!/usr/bin/env tsx
/**
 * Retry generating avatars for missing characters and upload to Convex.
 * Uses progressive sanitization (attempt 1: original, 2: light, 3: heavy, 4: generic).
 */
import path from "path";
import dotenv from "dotenv";
import { setCurrentBook } from "../helpers/getCurrentBook";
import { generateCharacterImageWithFluxAndMetadata } from "./new-tooling/generate-flux-schnel-image";
import { readBookFile, doesBookFileExist } from "../helpers/readBookFile";
import { writeBookFile } from "../helpers/writeBookFile";
import { FILE_TYPE } from "../helpers/filesHelpers";

dotenv.config();

// Import Convex client
const getConvexClient = async () => {
  const { convex } = await import("../server/convex-client");
  return convex;
};

interface Character {
  name: string;
  referenceCard: string;
}

interface ReferenceCards {
  characters: Character[];
}

const MISSING_CHARACTERS = [
  "god",
  "adramelech",
];

function getCharacterFileName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-") + ".png";
}

async function main() {
  const bookSlug = process.argv[2] || "john-milton_paradise-lost";
  const bookPath = `books/${bookSlug.replace(/^books\//, "")}`;

  console.log(`\n🔄 Retrying missing characters for: ${bookSlug}\n`);

  // Set up book context
  const repoRoot = path.resolve(__dirname, "../../");
  process.chdir(repoRoot);
  setCurrentBook(path.join("books-data", bookSlug));

  // Read reference cards
  if (!doesBookFileExist("single-summary-per-person.json", FILE_TYPE.PERMANENT)) {
    console.error("❌ No reference cards found");
    process.exit(1);
  }

  const referenceCards = JSON.parse(
    readBookFile("single-summary-per-person.json", FILE_TYPE.PERMANENT)
  ) as ReferenceCards;

  // Read graphical style
  if (!doesBookFileExist("graphicalStyle.json", FILE_TYPE.TEMPORARY)) {
    console.error("❌ No graphical style found");
    process.exit(1);
  }

  const style = JSON.parse(readBookFile("graphicalStyle.json", FILE_TYPE.TEMPORARY)) as {
    avatarStyle: string;
  };

  // Filter to only missing characters
  const missingCharacters = referenceCards.characters.filter((c) =>
    MISSING_CHARACTERS.includes(c.name.toLowerCase())
  );

  console.log(`Found ${missingCharacters.length} characters to retry:\n`);
  missingCharacters.forEach((c) => console.log(`  - ${c.name}`));
  console.log("");

  const convex = await getConvexClient();
  const results: { name: string; success: boolean; error?: string; sanitizationLevel?: string }[] = [];

  for (const character of missingCharacters) {
    const fileName = getCharacterFileName(character.name);
    console.log(`\n▶ Generating: ${character.name}`);
    console.log(`  Prompt: ${character.referenceCard.slice(0, 80)}...`);

    try {
      const result = await generateCharacterImageWithFluxAndMetadata(
        character.referenceCard,
        character.name,
        style.avatarStyle
      );

      if (!result) {
        console.log(`  ❌ Failed after all 4 attempts`);
        results.push({ name: character.name, success: false, error: "All attempts failed" });
        continue;
      }

      const { buffer, attempt, sanitizationLevel } = result;
      console.log(`  ✅ Generated on attempt ${attempt} (${sanitizationLevel})`);

      // Save locally
      const localPath = `characters/${fileName}`;
      writeBookFile(localPath, buffer, FILE_TYPE.PERMANENT);
      console.log(`  ✅ Saved locally: ${localPath}`);

      // Upload to Convex with verification metadata
      console.log(`  📤 Uploading to Convex...`);
      const needsVerification = sanitizationLevel !== "original";
      await convex.uploadFile({
        folderPath: `${bookPath}/characters`,
        basename: fileName,
        content: buffer,
        contentType: "image/png",
        publish: true,
        extra: {
          type: "avatar",
          characterName: character.name,
          regeneratedAt: new Date().toISOString(),
          // Verification tracking
          sanitizationLevel,
          attemptNumber: attempt,
          originalPrompt: character.referenceCard,
          needsVerification,
          verifiedAt: needsVerification ? null : new Date().toISOString(),
        },
      });
      console.log(`  ✅ Uploaded to Convex${needsVerification ? " (needs verification)" : ""}`);

      results.push({ name: character.name, success: true, sanitizationLevel });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`  ❌ Error: ${error}`);
      results.push({ name: character.name, success: false, error });
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("SUMMARY");
  console.log("=".repeat(50));

  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`\n✅ Succeeded: ${succeeded.length}`);
  succeeded.forEach((r) => console.log(`   - ${r.name}`));

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach((r) => console.log(`   - ${r.name}: ${r.error}`));
  }

  console.log("\nDone!");
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
