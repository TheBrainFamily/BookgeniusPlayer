#!/usr/bin/env tsx

import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, renameSync } from "fs";
import { join } from "path";

interface ResizeOptions {
  bookName: string;
  width?: number;
  height?: number;
  backup?: boolean;
}

class VideoResizer {
  private bookName: string;
  private width: number;
  private height: number;
  private backup: boolean;
  private assetsPath: string;
  private backupPath: string;

  constructor(options: ResizeOptions) {
    this.bookName = options.bookName;
    this.width = options.width || 480;
    this.height = options.height || 480;
    this.backup = options.backup !== false; // default to true
    this.assetsPath = join(process.cwd(), "public_books", this.bookName, "assets");
    this.backupPath = join(this.assetsPath, "original-videos-backup");
  }

  private checkPrerequisites(): void {
    // Check if ffmpeg is installed
    try {
      execSync("ffmpeg -version", { stdio: "ignore" });
    } catch {
      throw new Error("ffmpeg is not installed. Please install ffmpeg first.");
    }

    // Check if book directory exists
    if (!existsSync(this.assetsPath)) {
      throw new Error(`Book assets directory not found: ${this.assetsPath}`);
    }
  }

  private createBackupDirectory(): void {
    if (this.backup && !existsSync(this.backupPath)) {
      mkdirSync(this.backupPath, { recursive: true });
      console.log(`Created backup directory: ${this.backupPath}`);
    }
  }

  private getVideoFiles(): string[] {
    const files = readdirSync(this.assetsPath);
    return files.filter((file) => file.endsWith("-listens.mp4") || file.endsWith("-speaks.mp4"));
  }

  private resizeVideo(filename: string): void {
    const inputPath = join(this.assetsPath, filename);
    const outputPath = join(this.assetsPath, filename);
    const tempOutputPath = join(this.assetsPath, `temp_${filename}`);

    console.log(`Resizing ${filename} to ${this.width}x${this.height}...`);

    try {
      // Use ffmpeg to resize the video
      const command = `ffmpeg -i "${inputPath}" -vf "scale=${this.width}:${this.height}:force_original_aspect_ratio=decrease,pad=${this.width}:${this.height}:(ow-iw)/2:(oh-ih)/2" -c:a copy "${tempOutputPath}" -y`;

      execSync(command, { stdio: "pipe" });

      // Backup original if enabled
      if (this.backup) {
        const backupFilePath = join(this.backupPath, filename);
        renameSync(inputPath, backupFilePath);
        console.log(`  → Backed up original to: ${backupFilePath}`);
      }

      // Move temp file to final location
      renameSync(tempOutputPath, outputPath);
      console.log(`  → Successfully resized: ${filename}`);
    } catch (error) {
      console.error(`  → Error resizing ${filename}:`, error);

      // Clean up temp file if it exists
      if (existsSync(tempOutputPath)) {
        try {
          execSync(`rm "${tempOutputPath}"`);
        } catch (cleanupError) {
          console.error(`  → Error cleaning up temp file:`, cleanupError);
        }
      }
    }
  }

  public async resizeAll(): Promise<void> {
    console.log(`\n🎬 Starting video resize for book: ${this.bookName}`);
    console.log(`📁 Assets path: ${this.assetsPath}`);
    console.log(`📏 Target size: ${this.width}x${this.height}`);
    console.log(`💾 Backup enabled: ${this.backup}\n`);

    try {
      this.checkPrerequisites();
      this.createBackupDirectory();

      const videoFiles = this.getVideoFiles();

      if (videoFiles.length === 0) {
        console.log("No video files found matching the pattern (-listens.mp4 or -speaks.mp4)");
        return;
      }

      console.log(`Found ${videoFiles.length} video files to resize:\n`);

      for (const filename of videoFiles) {
        this.resizeVideo(filename);
      }

      console.log(`\n✅ Completed resizing ${videoFiles.length} video files for ${this.bookName}`);

      if (this.backup) {
        console.log(`📦 Original files backed up to: ${this.backupPath}`);
      }
    } catch (error) {
      console.error("❌ Error during video resize:", error);
      process.exit(1);
    }
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: tsx resize-character-videos.ts <bookName> [width] [height] [--no-backup]");
    console.log("");
    console.log("Examples:");
    console.log("  tsx resize-character-videos.ts 1984");
    console.log("  tsx resize-character-videos.ts 1984 480 480");
    console.log("  tsx resize-character-videos.ts 1984 480 480 --no-backup");
    process.exit(1);
  }

  const bookName = args[0];
  const width = parseInt(args[1]) || 480;
  const height = parseInt(args[2]) || 480;
  const backup = !args.includes("--no-backup");

  const resizer = new VideoResizer({ bookName, width, height, backup });

  await resizer.resizeAll();
}

if (require.main === module) {
  main().catch(console.error);
}

export { VideoResizer };
