// /**
//  * Import 1984-English Book
//  *
//  * This script imports the 1984-English book from the bookgenius folder
//  * into the asset-manager CMS with proper folder structure and metadata.
//  *
//  * Usage:
//  *   npx ts-node scripts/import1984.ts
//  *
//  * The script:
//  * 1. Creates folder structure (books/1984-English/{characters,chapters,backgrounds,music})
//  * 2. Parses metadata.xml for book metadata and characters
//  * 3. Creates character folders with CharacterFolderExtra metadata
//  * 4. Uploads character assets (avatar, speaks, listens)
//  * 5. Uploads chapter XMLs with ChapterExtra metadata
//  * 6. Uploads backgrounds with BackgroundExtra metadata
//  * 7. Uploads music with MusicExtra metadata
//  */

// import * as fs from "fs";
// import * as path from "path";
// import { ConvexHttpClient } from "convex/browser";
// import { api } from "@convex/_generated/api";

// // Import the actual source data
// import { getBackgroundsForBook } from "../../bookgenius/books/1984-English/getBackgroundsForBook";
// import { getBackgroundSongsForBook } from "../../bookgenius/books/1984-English/getBackgroundSongsForBook";

// // =============================================================================
// // Configuration
// // =============================================================================

// const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
// if (!CONVEX_URL) {
//   console.error("Missing CONVEX_URL environment variable");
//   process.exit(1);
// }

// const client = new ConvexHttpClient(CONVEX_URL);

// // Source paths
// const BOOK_ROOT = path.join(__dirname, "../../bookgenius/books/1984-English");
// const ASSETS_DIR = path.join(BOOK_ROOT, "assets");
// const CONTENT_DIR = path.join(BOOK_ROOT, "booksContent");

// // Target paths in CMS
// const BOOK_PATH = "books/1984-English";

// // =============================================================================
// // Types (matching CMS types)
// // =============================================================================

// interface BookFolderExtra {
//   type: "book";
//   title: string;
//   author: string;
//   language: string;
// }

// interface CharacterFolderExtra {
//   type: "character";
//   displayName: string;
//   summary: string;
// }

// interface ChapterExtra {
//   type: "chapter";
//   chapterNumber: number;
//   title: string;
// }

// interface BackgroundExtra {
//   type: "background";
//   chapter: number;
//   paragraph: number;
//   backgroundColor: string;
//   textColor: string;
// }

// interface MusicExtra {
//   type: "music";
//   chapter: number;
//   paragraph: number;
// }

// // =============================================================================
// // XML Parsing (simple regex-based, no external deps)
// // =============================================================================

// function parseMetadataXml(xmlContent: string): {
//   book: { slug: string; title: string; author: string; language: string };
//   characters: { slug: string; displayName: string; summary: string }[];
// } {
//   // Parse BookMetadata
//   const slugMatch = xmlContent.match(/<Slug>([^<]+)<\/Slug>/);
//   const titleMatch = xmlContent.match(/<Title>([^<]+)<\/Title>/);
//   const authorMatch = xmlContent.match(/<Author>([^<]+)<\/Author>/);
//   const languageMatch = xmlContent.match(/<Language>([^<]+)<\/Language>/);

//   const book = {
//     slug: slugMatch?.[1] || "1984-English",
//     title: titleMatch?.[1] || "1984",
//     author: authorMatch?.[1] || "George Orwell",
//     language: languageMatch?.[1] || "English",
//   };

//   // Parse CharactersMaster
//   // Format: <Winston-Smith display="Winston Smith" summary="..." />
//   const characterRegex =
//     /<([A-Za-z-]+)\s+display="([^"]+)"\s+summary="([^"]+)"/g;
//   const characters: { slug: string; displayName: string; summary: string }[] =
//     [];

//   let match;
//   while ((match = characterRegex.exec(xmlContent)) !== null) {
//     characters.push({
//       slug: match[1].toLowerCase(), // Convert to lowercase for folder names
//       displayName: match[2],
//       summary: match[3].replace(/&quot;/g, '"'), // Unescape quotes
//     });
//   }

//   return { book, characters };
// }

// function parseChapterTitle(xmlContent: string): string {
//   // Extract title from <h3>Chapter X</h3> or similar
//   const h3Match = xmlContent.match(/<h3>([^<]+)<\/h3>/);
//   return h3Match?.[1] || "Untitled Chapter";
// }

// // =============================================================================
// // Convex Operations
// // =============================================================================

// async function createFolderIfNeeded(
//   folderPath: string,
//   extra?: object,
// ): Promise<void> {
//   try {
//     const existing = await client.query(api.cli.getFolder, {
//       path: folderPath,
//     });
//     if (existing) {
//       console.log(`  Folder exists: ${folderPath}`);
//       return;
//     }
//   } catch {
//     // Folder doesn't exist, create it
//   }

//   try {
//     await client.mutation(api.cli.createFolderByPath, {
//       path: folderPath,
//       extra,
//     });
//     console.log(`  Created folder: ${folderPath}`);
//   } catch (error) {
//     console.error(`  Failed to create folder ${folderPath}:`, error);
//   }
// }

// async function uploadFile(
//   folderPath: string,
//   basename: string,
//   filePath: string,
//   extra?: object,
// ): Promise<void> {
//   // Check if file exists
//   if (!fs.existsSync(filePath)) {
//     console.log(`  Skipping (not found): ${filePath}`);
//     return;
//   }

//   const file = fs.readFileSync(filePath);
//   const contentType = getContentType(basename);

//   try {
//     // Start upload
//     const { intentId, uploadUrl, backend } = await client.mutation(
//       api.generateUploadUrl.startUpload,
//       {
//         folderPath,
//         basename,
//         publish: true,
//         extra,
//       },
//     );

//     // Upload to URL
//     const response = await fetch(uploadUrl, {
//       method: backend === "r2" ? "PUT" : "POST",
//       headers: { "Content-Type": contentType },
//       body: file,
//     });

//     if (!response.ok) {
//       throw new Error(`Upload failed: ${response.status}`);
//     }

//     // Parse response for Convex backend
//     const uploadResponse =
//       backend === "convex" ? await response.json() : undefined;

//     // Finish upload
//     await client.mutation(api.generateUploadUrl.finishUpload, {
//       intentId,
//       uploadResponse,
//       size: file.length,
//       contentType,
//     });

//     console.log(`  Uploaded: ${folderPath}/${basename}`);
//   } catch (error) {
//     console.error(`  Failed to upload ${basename}:`, error);
//   }
// }

// function getContentType(filename: string): string {
//   const ext = path.extname(filename).toLowerCase();
//   const types: Record<string, string> = {
//     ".png": "image/png",
//     ".jpg": "image/jpeg",
//     ".jpeg": "image/jpeg",
//     ".mp4": "video/mp4",
//     ".webm": "video/webm",
//     ".mp3": "audio/mpeg",
//     ".xml": "application/xml",
//   };
//   return types[ext] || "application/octet-stream";
// }

// // =============================================================================
// // Import Steps
// // =============================================================================

// async function step1_CreateFolderStructure(book: {
//   title: string;
//   author: string;
//   language: string;
// }): Promise<void> {
//   console.log("\n=== Step 1: Create Folder Structure ===");

//   // Create books root
//   await createFolderIfNeeded("books");

//   // Create book folder with metadata
//   const bookExtra: BookFolderExtra = {
//     type: "book",
//     title: book.title,
//     author: book.author,
//     language: book.language,
//   };
//   await createFolderIfNeeded(BOOK_PATH, bookExtra);

//   // Create subfolders
//   await createFolderIfNeeded(`${BOOK_PATH}/characters`);
//   await createFolderIfNeeded(`${BOOK_PATH}/chapters`);
//   await createFolderIfNeeded(`${BOOK_PATH}/backgrounds`);
//   await createFolderIfNeeded(`${BOOK_PATH}/music`);
// }

// async function step2_ImportCharacters(
//   characters: { slug: string; displayName: string; summary: string }[],
// ): Promise<void> {
//   console.log("\n=== Step 2: Import Characters ===");

//   for (const char of characters) {
//     console.log(`\nProcessing: ${char.displayName}`);

//     // Create character folder with metadata
//     const charPath = `${BOOK_PATH}/characters/${char.slug}`;
//     const charExtra: CharacterFolderExtra = {
//       type: "character",
//       displayName: char.displayName,
//       summary: char.summary,
//     };
//     await createFolderIfNeeded(charPath, charExtra);

//     // Upload assets
//     const avatarFile = path.join(ASSETS_DIR, `${char.slug}.png`);
//     const speaksFile = path.join(ASSETS_DIR, `${char.slug}-speaks.mp4`);
//     const listensFile = path.join(ASSETS_DIR, `${char.slug}-listens.mp4`);

//     await uploadFile(charPath, "avatar.png", avatarFile);
//     await uploadFile(charPath, "speaks.mp4", speaksFile);
//     await uploadFile(charPath, "listens.mp4", listensFile);
//   }
// }

// async function step3_ImportChapters(): Promise<void> {
//   console.log("\n=== Step 3: Import Chapters ===");

//   const chaptersPath = `${BOOK_PATH}/chapters`;

//   // Find all chapter files
//   const files = fs
//     .readdirSync(CONTENT_DIR)
//     .filter((f) => f.startsWith("chapter") && f.endsWith(".xml"));
//   files.sort((a, b) => {
//     const numA = parseInt(a.match(/chapter(\d+)/)?.[1] || "0");
//     const numB = parseInt(b.match(/chapter(\d+)/)?.[1] || "0");
//     return numA - numB;
//   });

//   for (const file of files) {
//     const chapterNum = parseInt(file.match(/chapter(\d+)/)?.[1] || "0");
//     const filePath = path.join(CONTENT_DIR, file);
//     const content = fs.readFileSync(filePath, "utf-8");
//     const title = parseChapterTitle(content);

//     console.log(`\nProcessing: Chapter ${chapterNum} - ${title}`);

//     const extra: ChapterExtra = {
//       type: "chapter",
//       chapterNumber: chapterNum,
//       title,
//     };

//     await uploadFile(chaptersPath, file, filePath, extra);
//   }
// }

// async function step4_ImportBackgrounds(): Promise<void> {
//   console.log("\n=== Step 4: Import Backgrounds ===");

//   const backgroundsPath = `${BOOK_PATH}/backgrounds`;
//   const backgrounds = getBackgroundsForBook();

//   console.log(`  Found ${backgrounds.length} background entries`);

//   // Track unique files to avoid duplicates (same file can be used for multiple paragraphs)
//   const uploadedFiles = new Set<string>();

//   for (const bg of backgrounds) {
//     // Skip if we've already uploaded this file
//     if (uploadedFiles.has(bg.file)) {
//       continue;
//     }

//     const filePath = path.join(ASSETS_DIR, bg.file);
//     if (!fs.existsSync(filePath)) {
//       console.log(`  Skipping (not found): ${bg.file}`);
//       continue;
//     }

//     const extra: BackgroundExtra = {
//       type: "background",
//       chapter: bg.chapter,
//       paragraph: bg.paragraph,
//       backgroundColor: bg.backgroundColor,
//       textColor: bg.textColor,
//     };

//     console.log(`  Uploading: ${bg.file}`);
//     await uploadFile(backgroundsPath, bg.file, filePath, extra);
//     uploadedFiles.add(bg.file);
//   }

//   console.log(`  Uploaded ${uploadedFiles.size} unique background files`);
// }

// async function step5_ImportMusic(): Promise<void> {
//   console.log("\n=== Step 5: Import Music ===");

//   const musicPath = `${BOOK_PATH}/music`;
//   const musicTracks = getBackgroundSongsForBook();

//   console.log(`  Found ${musicTracks.length} music entries`);

//   // Track unique files to avoid duplicates
//   const uploadedFiles = new Set<string>();

//   for (const track of musicTracks) {
//     for (const file of track.files) {
//       // Skip if we've already uploaded this file
//       if (uploadedFiles.has(file)) {
//         continue;
//       }

//       const filePath = path.join(ASSETS_DIR, file);
//       if (!fs.existsSync(filePath)) {
//         console.log(`  Skipping (not found): ${file}`);
//         continue;
//       }

//       const extra: MusicExtra = {
//         type: "music",
//         chapter: track.chapter,
//         paragraph: track.paragraph,
//       };

//       console.log(`  Uploading: ${file}`);
//       await uploadFile(musicPath, file, filePath, extra);
//       uploadedFiles.add(file);
//     }
//   }

//   console.log(`  Uploaded ${uploadedFiles.size} unique music files`);
// }

// // =============================================================================
// // Main
// // =============================================================================

// async function main() {
//   console.log("🚀 Starting 1984-English Import");
//   console.log(`   Source: ${BOOK_ROOT}`);
//   console.log(`   Target: ${BOOK_PATH}`);

//   // Parse metadata
//   const metadataPath = path.join(CONTENT_DIR, "metadata.xml");
//   if (!fs.existsSync(metadataPath)) {
//     console.error(`Metadata file not found: ${metadataPath}`);
//     process.exit(1);
//   }

//   const metadataContent = fs.readFileSync(metadataPath, "utf-8");
//   const { book, characters } = parseMetadataXml(metadataContent);

//   console.log(`\nParsed metadata:`);
//   console.log(`  Title: ${book.title}`);
//   console.log(`  Author: ${book.author}`);
//   console.log(`  Characters: ${characters.length}`);

//   // Run import steps
//   await step1_CreateFolderStructure(book);
//   await step2_ImportCharacters(characters);
//   await step3_ImportChapters();
//   await step4_ImportBackgrounds();
//   await step5_ImportMusic();

//   console.log("\n✅ Import complete!");
// }

// main().catch((error) => {
//   console.error("Import failed:", error);
//   process.exit(1);
// });
