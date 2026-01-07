#!/usr/bin/env tsx

import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, join, resolve } from "path";

const DEFAULT_WIDTH = 426;
const DEFAULT_HEIGHT = 240;
const DEFAULT_FPS = 24;
const DEFAULT_CRF = 28;
const DEFAULT_POSTER_QUALITY = 30;
const DEFAULT_POSTER_COMPRESSION = 6;

interface CliOptions {
  sourceVideo?: string;
  slugOverride?: string;
  version: string;
  width: number;
  height: number;
  fps: number;
  crf: number;
  posterQuality: number;
  posterCompression: number;
  force: boolean;
}

const usage = `Usage: tsx scripts/generate-platform-preview.ts <BookDirectoryName> [options]

Generates a downscaled looping MP4 preview and a matching WebP poster in apps/platform/public/.

Arguments:
  <BookDirectoryName>           Directory inside public_books, e.g. The-Tempest

Options:
  --source <filename>           Specific source video inside book assets (default: first openai-medium*.mp4)
  --slug <slug>                 Override output slug (defaults to slug from booksContent/metadata.xml)
  --version <tag>               Version tag appended to filenames (default: v1)
  --width <pixels>              Target width (default: ${DEFAULT_WIDTH})
  --height <pixels>             Target height (default: ${DEFAULT_HEIGHT})
  --fps <value>                 Output frames per second (default: ${DEFAULT_FPS})
  --crf <value>                 x264 CRF quality (default: ${DEFAULT_CRF})
  --poster-quality <0-100>      WebP quality (default: ${DEFAULT_POSTER_QUALITY})
  --poster-compression <0-6>    WebP compression level (default: ${DEFAULT_POSTER_COMPRESSION})
  --force                       Overwrite existing output files`;

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  console.error(usage);
  process.exit(1);
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "book"
  );
}

function ensureExecutable(command: string): void {
  const result = spawnSync(command, ["-version"], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    fail(`Required command "${command}" not found. Please install it and ensure it is on PATH.`);
  }
}

function runCommand(command: string, args: string[]): void {
  const printable = [command, ...args].map((part) => (part.includes(" ") ? `"${part}"` : part));
  console.log(`\n$ ${printable.join(" ")}`);

  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

// eslint-disable-next-line complexity
function parseArgs(): { bookDir: string; options: CliOptions } {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(usage);
    process.exit(1);
  }

  const bookDir = args[0];
  const options: CliOptions = {
    version: "v1",
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    fps: DEFAULT_FPS,
    crf: DEFAULT_CRF,
    posterQuality: DEFAULT_POSTER_QUALITY,
    posterCompression: DEFAULT_POSTER_COMPRESSION,
    force: false,
  };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      fail(`Unexpected argument "${arg}"`);
    }

    const next = () => {
      index += 1;
      if (index >= args.length) {
        fail(`Option "${arg}" expects a value`);
      }
      return args[index];
    };

    switch (arg) {
      case "--source":
        options.sourceVideo = next();
        break;
      case "--slug":
        options.slugOverride = next();
        break;
      case "--version":
        options.version = next();
        break;
      case "--width":
        options.width = Number(next());
        break;
      case "--height":
        options.height = Number(next());
        break;
      case "--fps":
        options.fps = Number(next());
        break;
      case "--crf":
        options.crf = Number(next());
        break;
      case "--poster-quality":
        options.posterQuality = Number(next());
        break;
      case "--poster-compression":
        options.posterCompression = Number(next());
        break;
      case "--force":
        options.force = true;
        index -= 1; // compensate for not consuming an extra value
        break;
      default:
        fail(`Unknown option "${arg}"`);
    }
  }

  // basic numeric validation
  if (Number.isNaN(options.width) || options.width <= 0) {
    fail("Width must be a positive number");
  }
  if (Number.isNaN(options.height) || options.height <= 0) {
    fail("Height must be a positive number");
  }
  if (Number.isNaN(options.fps) || options.fps <= 0) {
    fail("FPS must be a positive number");
  }
  if (Number.isNaN(options.crf) || options.crf < 0) {
    fail("CRF must be zero or greater");
  }
  if (
    Number.isNaN(options.posterQuality) ||
    options.posterQuality < 0 ||
    options.posterQuality > 100
  ) {
    fail("Poster quality must be between 0 and 100");
  }
  if (
    Number.isNaN(options.posterCompression) ||
    options.posterCompression < 0 ||
    options.posterCompression > 6
  ) {
    fail("Poster compression level must be between 0 and 6");
  }

  return { bookDir, options };
}

function findDefaultSourceVideo(assetsDir: string): string | undefined {
  const candidates = readdirSync(assetsDir)
    .filter((file) => file.startsWith("openai-medium") && file.endsWith(".mp4"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return candidates[0];
}

function readSlugFromMetadata(bookDirPath: string): string | undefined {
  const metadataPath = join(bookDirPath, "booksContent", "metadata.xml");
  if (!existsSync(metadataPath)) {
    return undefined;
  }

  try {
    const xml = readFileSync(metadataPath, "utf8");
    const match = xml.match(/<Slug>([^<]+)<\/Slug>/i);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function main() {
  const { bookDir, options } = parseArgs();

  ensureExecutable("ffmpeg");
  ensureExecutable("ffprobe");

  const playerRoot = process.cwd();
  const publicBooksDir = join(playerRoot, "public_books");
  const bookDirPath = join(publicBooksDir, bookDir);

  if (!existsSync(bookDirPath) || !statSync(bookDirPath).isDirectory()) {
    fail(`Book directory "${bookDir}" not found under ${publicBooksDir}`);
  }

  const assetsDir = join(bookDirPath, "assets");
  if (!existsSync(assetsDir)) {
    fail(`Assets directory missing: ${assetsDir}`);
  }

  const sourceFilename = options.sourceVideo ?? findDefaultSourceVideo(assetsDir);
  if (!sourceFilename) {
    fail(`No source video found in ${assetsDir}. Pass --source <filename> to select one.`);
  }

  const sourceVideoPath = join(assetsDir, sourceFilename);
  if (!existsSync(sourceVideoPath)) {
    fail(`Source video not found: ${sourceVideoPath}`);
  }

  const rawSlug = options.slugOverride ?? readSlugFromMetadata(bookDirPath) ?? slugify(bookDir);
  const slug = slugify(rawSlug);
  const versionTag = options.version.replace(/^\.+/, "");
  const outputBase = `${slug}.${versionTag}`;

  const platformPublicDir = resolve(playerRoot, "..", "platform", "public");
  if (!existsSync(platformPublicDir)) {
    mkdirSync(platformPublicDir, { recursive: true });
  }

  const mp4OutputPath = join(platformPublicDir, `${outputBase}.mp4`);
  const webpOutputPath = join(platformPublicDir, `${outputBase}.webp`);

  if (!options.force) {
    if (existsSync(mp4OutputPath)) {
      fail(`Output MP4 already exists: ${mp4OutputPath} (use --force to overwrite)`);
    }
    if (existsSync(webpOutputPath)) {
      fail(`Output WebP already exists: ${webpOutputPath} (use --force to overwrite)`);
    }
  }

  console.log("📚 Book:", bookDir);
  console.log("🎞️ Source video:", sourceFilename);
  console.log("🏷️ Slug:", slug);
  console.log("🏁 Version tag:", versionTag);
  console.log("🎯 Output base:", basename(outputBase));

  const scaleFilter = `scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2`;
  const mp4Args = [
    options.force ? "-y" : "-n",
    "-i",
    sourceVideoPath,
    "-vf",
    scaleFilter,
    "-r",
    options.fps.toString(),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    options.crf.toString(),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    mp4OutputPath,
  ];

  runCommand("ffmpeg", mp4Args);

  const posterArgs = [
    options.force ? "-y" : "-n",
    "-i",
    mp4OutputPath,
    "-vf",
    "select=eq(n\\,0)",
    "-frames:v",
    "1",
    "-vcodec",
    "libwebp",
    "-compression_level",
    options.posterCompression.toString(),
    "-quality",
    options.posterQuality.toString(),
    webpOutputPath,
  ];

  runCommand("ffmpeg", posterArgs);

  console.log("\n✅ Generated assets:");
  console.log(`   MP4 → ${mp4OutputPath}`);
  console.log(`   WebP → ${webpOutputPath}`);
}

main().catch((error) => {
  console.error("\n❌ Failed to generate preview assets:", error);
  process.exit(1);
});
