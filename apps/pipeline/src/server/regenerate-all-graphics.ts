#!/usr/bin/env bun
/**
 * Regenerate all graphics (avatars + backgrounds) for a book.
 *
 * Usage:
 *   bun regenerate-all-graphics.ts <book-slug> [--provider flux|openai]
 *
 * Examples:
 *   bun regenerate-all-graphics.ts arthur-conan-doyle_a-study-in-scarlet-openai --provider openai
 *   bun regenerate-all-graphics.ts arthur-conan-doyle_a-study-in-scarlet-flux --provider flux
 *
 * The --provider flag overrides the FREE_RUN environment variable.
 */

import path from "path";
import fs from "fs";
import { convex, getCharacterFolders } from "./convex-client";
import { setCurrentBook } from "../../src/helpers/getCurrentBook";
import { generateBackgrounds } from "../../src/tools/new-tooling/generate-prompts-for-backgrounds";
import { generateCharacterImageWithOpenAI } from "../../src/tools/new-tooling/generate-pictures-for-entities";
import { generateCharacterImageWithFlux } from "src/tools/new-tooling/generate-flux-schnel-image";
import "dotenv/config";

type Provider = "flux" | "openai";

function getContentType(filename: string): string {
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

async function generateAllAvatars(
  bookSlug: string,
  provider: Provider,
): Promise<{ success: number; failed: number }> {
  const bookPath = `books/${bookSlug}`;
  const repoRoot = path.resolve(__dirname, "../../");

  // Load graphical style
  const graphicalStylePath = path.join(
    repoRoot,
    "books-data",
    bookSlug,
    "temporary-output",
    "graphicalStyle.json",
  );

  if (!fs.existsSync(graphicalStylePath)) {
    console.log(`❌ No graphicalStyle.json found at ${graphicalStylePath}`);
    return { success: 0, failed: 0 };
  }

  const styleData = JSON.parse(fs.readFileSync(graphicalStylePath, "utf-8"));
  const avatarStyle = styleData.avatarStyle || "";

  if (!avatarStyle) {
    console.log("⚠️ No avatarStyle found in graphicalStyle.json");
  }

  // Get all characters
  const characters = await getCharacterFolders(bookPath);
  console.log(`\n🎨 Generating ${characters.length} avatars with ${provider.toUpperCase()}...`);

  const generator =
    provider === "flux" ? generateCharacterImageWithFlux : generateCharacterImageWithOpenAI;

  let success = 0;
  let failed = 0;

  // Generate in parallel with concurrency limit
  const CONCURRENCY = 30;
  for (let i = 0; i < characters.length; i += CONCURRENCY) {
    const batch = characters.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (char) => {
        if (!char.aiPrompt) {
          console.log(`  ⚠️ ${char.slug} - no aiPrompt, skipping`);
          return false;
        }

        try {
          await convex.markCharacterAvatarState({
            characterPath: `${bookPath}/characters/${char.slug}`,
            state: "generating",
          });

          console.log(`  📷 Generating ${char.slug}...`);
          const imageBuffer = await generator(char.aiPrompt, char.displayName, avatarStyle);

          if (!imageBuffer) {
            await convex.markCharacterAvatarState({
              characterPath: `${bookPath}/characters/${char.slug}`,
              state: "error",
            });
            console.log(`  ❌ ${char.slug} - generation failed`);
            return false;
          }

          // Save locally
          const outputDir = path.join(repoRoot, "books-data", bookSlug, "output", "characters");
          fs.mkdirSync(outputDir, { recursive: true });
          fs.writeFileSync(path.join(outputDir, `${char.slug}.png`), imageBuffer);

          // Upload to Convex
          await convex.uploadFile({
            folderPath: `${bookPath}/characters/${char.slug}`,
            basename: "avatar-large.png",
            content: imageBuffer,
            contentType: "image/png",
          });

          await convex.markCharacterAvatarState({
            characterPath: `${bookPath}/characters/${char.slug}`,
            state: "ready",
          });

          console.log(`  ✅ ${char.slug} - done`);
          return true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ❌ ${char.slug} - error: ${msg}`);
          await convex.markCharacterAvatarState({
            characterPath: `${bookPath}/characters/${char.slug}`,
            state: "error",
          });
          return false;
        }
      }),
    );

    success += results.filter(Boolean).length;
    failed += results.filter((r) => !r).length;
  }

  return { success, failed };
}

async function generateAllBackgrounds(
  bookSlug: string,
  provider: Provider,
): Promise<{ success: number; failed: number }> {
  const bookPath = `books/${bookSlug}`;
  const repoRoot = path.resolve(__dirname, "../../");

  // Set current book for the generation functions
  setCurrentBook(`books-data/${bookSlug}`);

  // Set FREE_RUN based on provider
  if (provider === "flux") {
    process.env.FREE_RUN = "true";
  } else {
    process.env.FREE_RUN = "false";
  }

  console.log(`\n🎨 Generating backgrounds with ${provider.toUpperCase()}...`);
  console.log(`   FREE_RUN=${process.env.FREE_RUN}`);

  // Generate backgrounds
  await generateBackgrounds({ outputSubfolder: "backgrounds" });

  // Upload to Convex
  const backgroundsDir = path.join(repoRoot, "books-data", bookSlug, "output", "backgrounds");

  if (!fs.existsSync(backgroundsDir)) {
    console.log(`⚠️ No backgrounds directory found at ${backgroundsDir}`);
    return { success: 0, failed: 0 };
  }

  const files = fs.readdirSync(backgroundsDir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));
  console.log(`\n📤 Uploading ${files.length} backgrounds to Convex...`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(backgroundsDir, file);
    const content = fs.readFileSync(filePath);

    try {
      await convex.uploadFile({
        folderPath: `${bookPath}/backgrounds`,
        basename: file,
        content,
        contentType: getContentType(file),
      });

      // Create background cue
      const match = file.match(/(\d+)-(\d+)/);
      if (match) {
        const chapter = parseInt(match[1], 10);
        const paragraph = parseInt(match[2], 10);
        await convex.upsertBackgroundCue({ bookPath, chapter, paragraph, fileBasename: file });
      }

      console.log(`  ✅ ${file}`);
      success++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ❌ ${file}: ${msg}`);
      failed++;
    }
  }

  return { success, failed };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`
Usage:
  bun regenerate-all-graphics.ts <book-slug> [--provider flux|openai]

Options:
  --provider flux    Use FLUX (Replicate) for image generation
  --provider openai  Use OpenAI for image generation (default)
  --avatars-only     Only regenerate avatars
  --backgrounds-only Only regenerate backgrounds

Examples:
  bun regenerate-all-graphics.ts arthur-conan-doyle_a-study-in-scarlet-openai --provider openai
  bun regenerate-all-graphics.ts arthur-conan-doyle_a-study-in-scarlet-flux --provider flux
`);
    process.exit(1);
  }

  const bookSlug = args[0];

  // Parse provider
  let provider: Provider = process.env.FREE_RUN === "true" ? "flux" : "openai";
  const providerIdx = args.indexOf("--provider");
  if (providerIdx !== -1 && args[providerIdx + 1]) {
    const p = args[providerIdx + 1].toLowerCase();
    if (p === "flux" || p === "openai") {
      provider = p;
    }
  }

  const avatarsOnly = args.includes("--avatars-only");
  const backgroundsOnly = args.includes("--backgrounds-only");

  console.log(`\n${"═".repeat(50)}`);
  console.log(`📚 Regenerating graphics for: ${bookSlug}`);
  console.log(`🎨 Provider: ${provider.toUpperCase()}`);
  console.log(`${"═".repeat(50)}`);

  // Set FREE_RUN for avatars
  if (provider === "flux") {
    process.env.FREE_RUN = "true";
  } else {
    process.env.FREE_RUN = "false";
  }

  let avatarResults = { success: 0, failed: 0 };
  let backgroundResults = { success: 0, failed: 0 };

  if (!backgroundsOnly) {
    avatarResults = await generateAllAvatars(bookSlug, provider);
  }

  if (!avatarsOnly) {
    backgroundResults = await generateAllBackgrounds(bookSlug, provider);
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`✅ Graphics regeneration complete!`);
  if (!backgroundsOnly) {
    console.log(`   Avatars: ${avatarResults.success} succeeded, ${avatarResults.failed} failed`);
  }
  if (!avatarsOnly) {
    console.log(
      `   Backgrounds: ${backgroundResults.success} succeeded, ${backgroundResults.failed} failed`,
    );
  }
  console.log(`${"═".repeat(50)}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
