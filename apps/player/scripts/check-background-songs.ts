#!/usr/bin/env tsx

// Check MP3 background songs for a book using getBackgroundSongsForBook function
// Usage: tsx check-background-songs.ts <book-name>
// Example: tsx check-background-songs.ts Krolowa-Sniegu

import { existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

interface BackgroundSongForBook {
  chapter: number;
  paragraph: number;
  files: string[];
}

interface SongAsset {
  chapter: number;
  paragraph: number;
  file: string;
  exists: boolean;
  hasMetadata: boolean;
  hasTitle: boolean;
  hasCover: boolean;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  bitrate?: number;
}

async function loadBackgroundSongsForBook(bookPath: string): Promise<BackgroundSongForBook[]> {
  try {
    const songsPath = join(bookPath, "getBackgroundSongsForBook.ts");
    if (!existsSync(songsPath)) {
      console.error(`❌ getBackgroundSongsForBook.ts not found at ${songsPath}`);
      return [];
    }

    // Use dynamic import for a robust way to load the data
    const absolutePath = resolve(songsPath);
    const module = await import(`file://${absolutePath}`);
    return module.getBackgroundSongsForBook();
  } catch (error) {
    console.error(`❌ Error loading background songs: ${error}`);
    return [];
  }
}

function getMP3Metadata(filePath: string): {
  hasMetadata: boolean;
  hasTitle: boolean;
  hasCover: boolean;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  bitrate?: number;
} {
  try {
    const output = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`, { encoding: "utf8" });
    const data = JSON.parse(output);

    const format = data.format;
    const audioStream = data.streams.find((stream: { codec_type: string }) => stream.codec_type === "audio");

    if (!format || !audioStream) {
      return { hasMetadata: false, hasTitle: false, hasCover: false };
    }

    const title = format.tags?.title || format.tags?.TITLE;
    const artist = format.tags?.artist || format.tags?.ARTIST;
    const album = format.tags?.album || format.tags?.ALBUM;
    const duration = parseFloat(format.duration) || undefined;
    const bitrate = parseInt(format.bit_rate) || undefined;

    // Check for cover art using multiple methods
    let hasCover = false;

    // Method 1: Check for picture streams (most reliable)
    const hasPictureStream = data.streams.some(
      (stream: any) => stream.codec_type === "video" || stream.codec_name === "mjpeg" || stream.codec_name === "png" || stream.codec_name === "gif",
    );

    // Method 2: Check for embedded picture tags
    const hasPictureTags =
      format.tags?.attached_picture === "1" ||
      format.tags?.ATTACHED_PICTURE === "1" ||
      format.tags?.APIC === "1" ||
      format.tags?.apic === "1" ||
      format.tags?.has_cover_art === "1" ||
      format.tags?.HAS_COVER_ART === "1";

    hasCover = hasPictureStream || hasPictureTags;

    return { hasMetadata: true, hasTitle: !!title, hasCover, title, artist, album, duration, bitrate };
  } catch {
    return { hasMetadata: false, hasTitle: false, hasCover: false };
  }
}

async function checkSongAssets(bookPath: string): Promise<SongAsset[]> {
  const songs = await loadBackgroundSongsForBook(bookPath);
  const assetsDir = join(bookPath, "assets");

  if (!existsSync(assetsDir)) {
    console.error(`❌ Assets directory not found at ${assetsDir}`);
    return [];
  }

  const results: SongAsset[] = [];

  for (const song of songs) {
    for (const file of song.files) {
      const filePath = join(assetsDir, file);
      const exists = existsSync(filePath);

      let metadata = { hasMetadata: false, hasTitle: false, hasCover: false };
      if (exists) {
        metadata = getMP3Metadata(filePath);
      }

      results.push({ chapter: song.chapter, paragraph: song.paragraph, file, exists, ...metadata });
    }
  }

  return results;
}

function findOrphanedMP3Files(bookPath: string, expectedFiles: string[]): string[] {
  const assetsDir = join(bookPath, "assets");
  if (!existsSync(assetsDir)) {
    return [];
  }

  const allFiles = readdirSync(assetsDir);
  const mp3Files = allFiles.filter((file) => file.endsWith(".mp3"));

  // Find files that are not in the expected list
  return mp3Files.filter((file) => !expectedFiles.includes(file));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: tsx check-background-songs.ts <book-name>");
    console.error("Example: tsx check-background-songs.ts Krolowa-Sniegu");
    process.exit(1);
  }

  const bookPath = args[0];
  console.log(`\n\n\nChecking MP3 background songs for book: ${bookPath}`);

  const songAssets = await checkSongAssets(bookPath);

  if (songAssets.length === 0) {
    console.log("❌ No background songs found in getBackgroundSongsForBook.ts");
    return;
  }

  const totalSongs = songAssets.length;
  const uniqueChapters = new Set(songAssets.map((asset) => asset.chapter)).size;

  console.log(`\nBackground songs defined in getBackgroundSongsForBook.ts: ${totalSongs} files across ${uniqueChapters} chapters`);

  // Check for missing assets
  const missing = songAssets.filter((asset) => !asset.exists);
  if (missing.length > 0) {
    console.log(`\n❌ Missing MP3 Files: ${missing.length}`);
    missing.forEach((asset) => {
      console.log(`  Chapter ${asset.chapter}, Paragraph ${asset.paragraph}: ${asset.file}`);
    });
  }

  // Check for metadata issues
  const noMetadata = songAssets.filter((asset) => asset.exists && !asset.hasMetadata);

  const noTitle = songAssets.filter((asset) => asset.exists && asset.hasMetadata && !asset.hasTitle);

  const noCover = songAssets.filter((asset) => asset.exists && asset.hasMetadata && !asset.hasCover);

  if (noMetadata.length > 0) {
    console.log(`\n⚠️  No Metadata: ${noMetadata.length}`);
    noMetadata.forEach((asset) => {
      console.log(`  ${asset.file}`);
    });
  }

  if (noTitle.length > 0) {
    console.log(`\n⚠️  No Title: ${noTitle.length}`);
    noTitle.forEach((asset) => {
      console.log(`  ${asset.file}`);
    });
  }

  if (noCover.length > 0) {
    console.log(`\n⚠️  No Cover Art: ${noCover.length}`);
    noCover.forEach((asset) => {
      console.log(`  ${asset.file}`);
    });
  }

  // Check for orphaned MP3 files
  const expectedFiles = songAssets.map((asset) => asset.file);
  const orphanedFiles = findOrphanedMP3Files(bookPath, expectedFiles);

  if (orphanedFiles.length > 0) {
    console.log(`\n🔍 Orphaned MP3 Files: ${orphanedFiles.length}`);
    orphanedFiles.forEach((file) => {
      const filePath = join(bookPath, "assets", file);
      const metadata = getMP3Metadata(filePath);
      const metadataInfo = metadata.hasMetadata ? ` (${metadata.hasTitle ? "has title" : "no title"}, ${metadata.hasCover ? "has cover" : "no cover"})` : " (no metadata)";
      console.log(`  ${file}${metadataInfo}`);
    });
  }

  // Summary
  const totalIssues = missing.length + noMetadata.length + noTitle.length + noCover.length + orphanedFiles.length;
  if (totalIssues === 0) {
    console.log("\n✅ All background songs are present with complete metadata!");
  } else {
    console.log(
      `\n📊 Summary: ${missing.length} missing files, ${noMetadata.length} no metadata, ${noTitle.length} no title, ${noCover.length} no cover, ${orphanedFiles.length} orphaned files`,
    );
  }

  // Show successful assets
  const successful = songAssets.filter((asset) => asset.exists && asset.hasMetadata && asset.hasTitle && asset.hasCover);
  if (successful.length > 0) {
    console.log(`\n✅ Successful Assets: ${successful.length} songs with complete metadata`);
  }

  // Show metadata statistics
  const withMetadata = songAssets.filter((asset) => asset.exists && asset.hasMetadata).length;
  const withTitle = songAssets.filter((asset) => asset.exists && asset.hasMetadata && asset.hasTitle).length;
  const withCover = songAssets.filter((asset) => asset.exists && asset.hasMetadata && asset.hasCover).length;

  if (songAssets.length > 0) {
    console.log(`\n📈 Metadata Statistics:`);
    console.log(`  Files with metadata: ${withMetadata}/${songAssets.length} (${Math.round((withMetadata / songAssets.length) * 100)}%)`);
    console.log(`  Files with title: ${withTitle}/${songAssets.length} (${Math.round((withTitle / songAssets.length) * 100)}%)`);
    console.log(`  Files with cover: ${withCover}/${songAssets.length} (${Math.round((withCover / songAssets.length) * 100)}%)`);
  }
}

if (require.main === module) {
  main();
}
