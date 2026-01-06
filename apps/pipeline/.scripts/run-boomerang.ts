import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";

/**
 * Options for the boomerang video creation script.
 * These correspond to the command-line arguments of the python script.
 */
export type BoomerangOptions = {
  /** Input video file path. Should be relative to the `executionPath` provided to `runBoomerang`. */
  input: string;
  /** Output video file path. Should be relative to the `executionPath` provided to `runBoomerang`. */
  output: string;
  /** Video codec (e.g., 'libx264'). */
  codec?: string;
  /** Constant Rate Factor for quality (e.g., '23'). */
  crf?: string;
  /** Encoding preset (e.g., 'medium'). */
  preset?: string;
  /** Target video bitrate for hardware acceleration (e.g., '8M'). */
  bitrate?: string;
  /** Slowdown factor (e.g., 1.5). */
  slowdown?: number;
  /** Crossfade duration in seconds (e.g., 0.3). */
  fade?: number;
  /** Whether to keep the audio track. */
  audio?: boolean;
  /** Whether to use hardware acceleration (macOS VideoToolbox). */
  hwaccel?: boolean;
  /** Optional path to the ffprobe executable. */
  ffprobePath?: string;
  /** Optional path to the ffmpeg executable. */
  ffmpegPath?: string;
};

/**
 * Executes the boomerang python script with the given options.
 * @param options - The configuration for the boomerang effect.
 * @param executionPath - The directory where the python script will be executed.
 *                        Input/output paths in options should be relative to this path.
 * @returns A promise that resolves when the script completes successfully, and rejects on error.
 */
export const runBoomerang = (options: BoomerangOptions, executionPath: string): Promise<void> => {
  const scriptPath = path.resolve(__dirname, "boomerang-gemini-fade.py");

  const scriptArgs: string[] = [];
  for (const key in options) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      const value = options[key as keyof BoomerangOptions];
      if (value === undefined) continue;

      const argName = `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
      if (typeof value === "boolean") {
        if (value) {
          scriptArgs.push(argName);
        }
      } else {
        scriptArgs.push(argName, String(value));
      }
    }
  }

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python3", [scriptPath, ...scriptArgs], {
      cwd: executionPath,
      stdio: "inherit",
    });

    pythonProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Python script exited with code ${code}`));
      }
    });

    pythonProcess.on("error", (err) => {
      reject(err);
    });
  });
};

export const processBoomerangOnFile = async (file: string, directoryPath: string) => {
  const { name, ext } = path.parse(file);
  console.log("82: name BANG!", name);
  if (ext.toLowerCase() !== ".mp4") {
    console.error(`Input must be a .mp4 file, but got ${file}`);
    return;
  }
  const tempOutputFilename = `${name}.new${ext}`;
  const originalFilePath = path.join(directoryPath, file);
  const tempOutputFilePath = path.join(directoryPath, tempOutputFilename);

  console.log(`\nProcessing: ${file}`);
  console.log(`  - Outputting to temporary file: ${tempOutputFilename}`);

  try {
    await runBoomerang(
      { input: file, output: tempOutputFilename, slowdown: 1.7, crf: "20" },
      directoryPath,
    );

    console.log(`  - Boomerang script finished. Renaming ${tempOutputFilename} to ${file}`);
    await fs.rename(tempOutputFilePath, originalFilePath);
    console.log(`✅ Successfully updated ${file}`);
  } catch (error) {
    console.error(`❌ Failed to process ${file}:`, error);
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempOutputFilePath);
      console.log(`  - Cleaned up temporary file: ${tempOutputFilename}`);
    } catch {
      // Ignore error if file doesn't exist, it might not have been created.
    }
  }
};

export const processBoomerangInDirectory = async (directoryPath: string) => {
  console.log(`Scanning directory for .mp4 files: ${directoryPath}`);
  try {
    const files = await fs.readdir(directoryPath);
    const mp4Files = files.filter((file) => path.extname(file).toLowerCase() === ".mp4");

    if (mp4Files.length === 0) {
      console.log(`No .mp4 files found in ${directoryPath}.`);
      return;
    }

    console.log(`Found ${mp4Files.length} .mp4 file(s) to process.`);

    const sortedMp4Files = mp4Files.sort((a, b) => {
      // Extract chapter and subchapter numbers from filenames like openai-medium-38-44.mp4
      const extractChapterSub = (filename: string): [number, number] => {
        // Match the last two dash-separated numbers before the extension
        // e.g. openai-medium-38-44.mp4 => [38, 44]
        const match = filename.match(/-(\d+)-(\d+)\.mp4$/);
        if (match) {
          return [parseInt(match[1], 10), parseInt(match[2], 10)];
        }
        // Fallback: try to match a single number (e.g. openai-medium-4-1.mp4)
        const singleMatch = filename.match(/-(\d+)\.mp4$/);
        if (singleMatch) {
          return [parseInt(singleMatch[1], 10), 0];
        }
        // If no match, sort at the end
        return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
      };

      const [chapterA, subA] = extractChapterSub(a);
      const [chapterB, subB] = extractChapterSub(b);

      if (chapterA !== chapterB) {
        return chapterA - chapterB;
      }
      return subA - subB;
    });

    const batchSize = 8;
    for (let i = 0; i < sortedMp4Files.length; i += batchSize) {
      const batch = sortedMp4Files.slice(i, i + batchSize);
      console.log(
        `\nProcessing batch ${i / batchSize + 1} of ${Math.ceil(sortedMp4Files.length / batchSize)}...`,
      );

      const processingPromises = batch.map((file) => processBoomerangOnFile(file, directoryPath));
      await Promise.all(processingPromises);
    }
    console.log("\nAll files processed.");
  } catch (error) {
    console.error(`Error processing directory ${directoryPath}:`, error);
    process.exit(1);
  }
};

if (require.main === module) {
  (async () => {
    const targetPath = process.argv[2];

    if (!targetPath) {
      console.error("Usage: ts-node .scripts/run-boomerang.ts <path-to-directory-or-file>");
      process.exit(1);
    }

    try {
      const absolutePath = path.resolve(targetPath);
      const stats = await fs.stat(absolutePath);

      if (stats.isDirectory()) {
        await processBoomerangInDirectory(absolutePath);
      } else if (stats.isFile()) {
        const directory = path.dirname(absolutePath);
        const file = path.basename(absolutePath);
        await processBoomerangOnFile(file, directory);
      } else {
        console.error(`Error: Path is not a file or directory: ${absolutePath}`);
        process.exit(1);
      }
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        console.error(`Error: Path does not exist: ${targetPath}`);
      } else {
        console.error(`An unexpected error occurred:`, error);
      }
      process.exit(1);
    }
  })();
}
