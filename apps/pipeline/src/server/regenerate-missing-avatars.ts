import path from "path";
import fs from "fs";
import {
  convex,
  getCharacterFolders,
  getPublishedFilesInFolder,
  updateCharacterFolder,
} from "./convex-client";
import { generateCharacterImageWithOpenAI } from "../../src/tools/new-tooling/generate-pictures-for-entities";
import "dotenv/config";
import { generateCharacterImageWithFlux } from "src/tools/new-tooling/generate-flux-schnel-image";

interface GeneratedPrompt {
  name: string;
  visualGuide: string;
}

interface GeneratedPromptsFile {
  characters: GeneratedPrompt[];
}

async function injectAiPrompts(bookPath: string, generatedPromptsPath: string): Promise<void> {
  console.log(`\n📥 Injecting AI prompts from ${generatedPromptsPath} into ${bookPath}...`);

  const generatedPromptsContent = fs.readFileSync(generatedPromptsPath, "utf-8");
  const generatedPrompts: GeneratedPromptsFile = JSON.parse(generatedPromptsContent);

  const characterFolders = await getCharacterFolders(bookPath);
  console.log(`Found ${characterFolders.length} character folders in Convex`);

  let injected = 0;
  let skipped = 0;

  for (const prompt of generatedPrompts.characters) {
    const matchingFolder = characterFolders.find((f) => f.slug === prompt.name);

    if (!matchingFolder) {
      console.log(`  ⚠️  No folder found for character: ${prompt.name}`);
      skipped++;
      continue;
    }

    if (matchingFolder.aiPrompt) {
      console.log(`  ⏭️  ${prompt.name} already has aiPrompt, skipping`);
      skipped++;
      continue;
    }

    console.log(`  💉 Injecting aiPrompt for ${prompt.name}`);
    await updateCharacterFolder({
      bookPath,
      characterSlug: prompt.name,
      displayName: matchingFolder.displayName,
      summary: matchingFolder.summary,
      aiPrompt: prompt.visualGuide,
    });
    injected++;
  }

  console.log(`✅ Injection complete: ${injected} injected, ${skipped} skipped`);
}

interface MissingAvatars {
  missingLarge: { slug: string; aiPrompt: string; displayName: string }[];
  missingWebp: string[];
}

async function findCharactersMissingAvatars(bookPath: string): Promise<MissingAvatars> {
  console.log(`\n🔍 Finding characters missing avatars in ${bookPath}...`);

  const characterFolders = await getCharacterFolders(bookPath);
  const missingLarge: { slug: string; aiPrompt: string; displayName: string }[] = [];
  const missingWebp: string[] = [];

  for (const folder of characterFolders) {
    const files = await getPublishedFilesInFolder(folder.path);
    const hasAvatarLarge = files.some((f) => f.basename === "avatar-large.png");
    const hasAvatarWebp = files.some((f) => f.basename === "avatar.webp");

    if (!hasAvatarLarge) {
      if (folder.aiPrompt) {
        console.log(`  ❌ ${folder.slug} - missing avatar-large.png (has aiPrompt)`);
        missingLarge.push({
          slug: folder.slug,
          aiPrompt: folder.aiPrompt,
          displayName: folder.displayName,
        });
      } else {
        console.log(`  ⚠️  ${folder.slug} - missing avatar-large.png AND aiPrompt`);
      }
    } else if (!hasAvatarWebp) {
      console.log(`  🔄 ${folder.slug} - has avatar-large.png but missing avatar.webp`);
      missingWebp.push(folder.slug);
    } else {
      console.log(`  ✅ ${folder.slug} - has both avatars`);
    }
  }

  console.log(`\nFound ${missingLarge.length} characters missing avatar-large.png`);
  if (missingWebp.length > 0) {
    console.log(`Found ${missingWebp.length} characters missing avatar.webp (run repair):`);
    missingWebp.forEach((slug) => {
      console.log(
        `  ./scripts/convex run admin/regenerateAvatarWebp:regenerateAvatarWebp '{"characterPath": "${bookPath}/characters/${slug}"}'`,
      );
    });
  }

  return { missingLarge, missingWebp };
}

async function generateSingleAvatar(
  bookPath: string,
  character: { slug: string; aiPrompt: string; displayName: string },
  avatarStyle: string,
): Promise<{ slug: string; success: boolean; error?: string }> {
  console.log(`📷 Generating avatar for ${character.slug}...`);

  try {
    await convex.markCharacterAvatarState({
      characterPath: `${bookPath}/characters/${character.slug}`,
      state: "generating",
    });

    const generator =
      process.env.FREE_RUN === "true"
        ? generateCharacterImageWithFlux
        : generateCharacterImageWithOpenAI;
    const imageBuffer = await generator(character.aiPrompt, character.displayName, avatarStyle);

    if (!imageBuffer) {
      await convex.markCharacterAvatarState({
        characterPath: `${bookPath}/characters/${character.slug}`,
        state: "error",
      });
      return { slug: character.slug, success: false, error: "Failed to generate image" };
    }

    console.log(`📤 Uploading avatar-large.png for ${character.slug}...`);
    await convex.uploadFile({
      folderPath: `${bookPath}/characters/${character.slug}`,
      basename: "avatar-large.png",
      content: imageBuffer,
      contentType: "image/png",
    });

    await convex.markCharacterAvatarState({
      characterPath: `${bookPath}/characters/${character.slug}`,
      state: "ready",
    });
    console.log(`✅ Successfully generated and uploaded avatar for ${character.slug}`);
    return { slug: character.slug, success: true };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`❌ Error processing ${character.slug}:`, errorMsg);
    await convex.markCharacterAvatarState({
      characterPath: `${bookPath}/characters/${character.slug}`,
      state: "error",
    });
    return { slug: character.slug, success: false, error: errorMsg };
  }
}

/**
 * Generate a generic avatar for unknown/minor characters.
 * This avatar matches the book's art style but shows a mysterious silhouette
 * that can be used for any speaker not in the character list.
 */
async function generateGenericAvatar(bookPath: string, avatarStyle: string): Promise<void> {
  const genericPath = `${bookPath}/characters/generic`;

  // Check if generic avatar already exists
  try {
    const files = await getPublishedFilesInFolder(genericPath);
    const hasAvatar = files.some((f) => f.basename === "avatar-large.png");
    if (hasAvatar) {
      console.log("✅ Generic avatar already exists, skipping");
      return;
    }
  } catch {
    // Folder doesn't exist yet, that's fine
  }

  console.log("📷 Generating generic avatar for unknown characters...");

  const genericPrompt = `A mysterious figure shown from behind or in silhouette.
No distinct facial features visible. The figure should feel enigmatic and anonymous,
suitable for representing any unnamed or minor character.
Atmospheric lighting with the figure partially obscured by shadow or mist.`;

  try {
    const generator =
      process.env.FREE_RUN === "true"
        ? generateCharacterImageWithFlux
        : generateCharacterImageWithOpenAI;
    const imageBuffer = await generator(genericPrompt, "Unknown Character", avatarStyle);

    if (!imageBuffer) {
      console.error("❌ Failed to generate generic avatar");
      return;
    }

    console.log("📤 Uploading generic avatar...");
    await convex.uploadFile({
      folderPath: genericPath,
      basename: "avatar-large.png",
      content: imageBuffer,
      contentType: "image/png",
    });

    console.log("✅ Successfully generated and uploaded generic avatar");
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("❌ Error generating generic avatar:", errorMsg);
  }
}

async function regenerateMissingAvatars(bookPath: string, avatarStyle: string): Promise<void> {
  const { missingLarge } = await findCharactersMissingAvatars(bookPath);

  if (missingLarge.length === 0) {
    console.log("✅ All characters have avatar-large.png, nothing to regenerate");
    return;
  }

  console.log(`\n🎨 Regenerating ${missingLarge.length} missing avatars in parallel...`);

  const results = await Promise.all(
    missingLarge.map((character) => generateSingleAvatar(bookPath, character, avatarStyle)),
  );

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);

  console.log(`\n🏁 Avatar regeneration complete: ${succeeded}/${missingLarge.length} succeeded`);
  if (failed.length > 0) {
    console.log(`Failed characters: ${failed.map((f) => f.slug).join(", ")}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(
      "Usage: tsx regenerate-missing-avatars.ts <book-slug> [--inject-only] [--check-only]",
    );
    console.log("");
    console.log("Examples:");
    console.log(
      "  tsx regenerate-missing-avatars.ts 1766867074631-dolega-mostowicz-prokurator-alicja-horn",
    );
    console.log(
      "  tsx regenerate-missing-avatars.ts 1766867074631-dolega-mostowicz-prokurator-alicja-horn --inject-only",
    );
    console.log(
      "  tsx regenerate-missing-avatars.ts 1766867074631-dolega-mostowicz-prokurator-alicja-horn --check-only",
    );
    process.exit(1);
  }

  const bookSlug = args[0];
  const bookPath = `books/${bookSlug}`;
  const injectOnly = args.includes("--inject-only");
  const checkOnly = args.includes("--check-only");

  const generatedPromptsPath = path.resolve(
    __dirname,
    `../../books-data/${bookSlug}/temporary-output/generated-prompts.json`,
  );

  if (fs.existsSync(generatedPromptsPath)) {
    await injectAiPrompts(bookPath, generatedPromptsPath);
  } else {
    console.log(`⚠️  No generated-prompts.json found at ${generatedPromptsPath}`);
  }

  if (injectOnly) {
    console.log("\n--inject-only flag set, stopping after injection");
    process.exit(0);
  }

  if (checkOnly) {
    await findCharactersMissingAvatars(bookPath);
    console.log("\n--check-only flag set, not regenerating");
    process.exit(0);
  }

  const graphicalStylePath = path.resolve(
    __dirname,
    `../../books-data/${bookSlug}/temporary-output/graphicalStyle.json`,
  );

  console.log(`graphicalStylePath: ${graphicalStylePath}`);

  const styleData = JSON.parse(fs.readFileSync(graphicalStylePath, "utf-8"));
  if (!styleData.avatarStyle) {
    console.log(`⚠️  No avatarStyle found in graphicalStyle.json`);
    process.exit(1);
  }

  await regenerateMissingAvatars(bookPath, styleData.avatarStyle);

  // Generate a generic avatar for unknown/minor characters
  await generateGenericAvatar(bookPath, styleData.avatarStyle);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
