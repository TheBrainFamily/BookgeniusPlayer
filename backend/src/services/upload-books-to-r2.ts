import { S3Client } from "bun";
import fs from "fs-extra";
import path from "path";

function createR2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Missing R2 environment variables. Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET");
  }

  return new S3Client({ endpoint, accessKeyId, secretAccessKey, bucket });
}

/**
 * Upload a single book folder to R2.
 * Expects folder structure:
 *   - {folderPath}/embeddings.json
 *   - {folderPath}/rich.xml
 *
 * Uploads to R2 as:
 *   - answer-server-data/{bookSlug}/embeddings.json
 *   - answer-server-data/{bookSlug}/rich.xml
 *
 * @param folderPath - Absolute or relative path to the book folder
 * @param bookSlug - Optional custom slug (defaults to folder name)
 * @returns Promise<{ success: boolean; bookSlug: string; error?: string }>
 */
export async function uploadBookFolder(folderPath: string, bookSlug?: string): Promise<{ success: boolean; bookSlug: string; error?: string }> {
  const r2 = createR2Client();
  const resolvedPath = path.resolve(folderPath);
  const slug = bookSlug || path.basename(resolvedPath);

  const embeddingsSrc = path.join(resolvedPath, "embeddings.json");
  const richXmlSrc = path.join(resolvedPath, "rich.xml");

  if (!(await fs.pathExists(embeddingsSrc))) {
    return { success: false, bookSlug: slug, error: `embeddings.json not found at ${embeddingsSrc}` };
  }
  if (!(await fs.pathExists(richXmlSrc))) {
    return { success: false, bookSlug: slug, error: `rich.xml not found at ${richXmlSrc}` };
  }

  try {
    const embeddingsKey = `answer-server-data/${slug}/embeddings.json`;
    const embeddingsContent = await fs.readFile(embeddingsSrc);
    const embeddingsFile = r2.file(embeddingsKey);
    await embeddingsFile.write(embeddingsContent);
    console.log(`  ✅ Uploaded ${embeddingsKey} (${(embeddingsContent.length / 1024 / 1024).toFixed(2)} MB)`);

    const richXmlKey = `answer-server-data/${slug}/rich.xml`;
    const richXmlContent = await fs.readFile(richXmlSrc);
    const richXmlFile = r2.file(richXmlKey);
    await richXmlFile.write(richXmlContent);
    console.log(`  ✅ Uploaded ${richXmlKey} (${(richXmlContent.length / 1024).toFixed(2)} KB)`);

    return { success: true, bookSlug: slug };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, bookSlug: slug, error: message };
  }
}

/**
 * Upload all books from a books-data directory to R2.
 * Iterates over subdirectories and uploads each book that has embeddings.
 *
 * @param booksDataDir - Path to the books-data directory
 */
export async function uploadAllBooks(booksDataDir: string): Promise<void> {
  const resolvedDir = path.resolve(booksDataDir);

  if (!(await fs.pathExists(resolvedDir))) {
    console.error(`❌ Directory not found: ${resolvedDir}`);
    process.exit(1);
  }

  const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
  const bookFolders = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  console.log(`📚 Found ${bookFolders.length} book folders in ${resolvedDir}\n`);

  const results: { slug: string; success: boolean; error?: string }[] = [];

  for (const folder of bookFolders) {
    const folderPath = path.join(resolvedDir, folder);
    const embeddingsPath = path.join(folderPath, "embeddings.json");

    if (!(await fs.pathExists(embeddingsPath))) {
      console.log(`⏭️  Skipping ${folder} (no embeddings.json)`);
      continue;
    }

    console.log(`📤 Uploading ${folder}...`);
    const result = await uploadBookFolder(folderPath);
    results.push({ slug: result.bookSlug, success: result.success, error: result.error });

    if (!result.success) {
      console.error(`  ❌ Failed: ${result.error}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Upload Summary:");
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  console.log(`  ✅ Successful: ${successful.length}`);
  console.log(`  ❌ Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed uploads:");
    for (const f of failed) {
      console.log(`  - ${f.slug}: ${f.error}`);
    }
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage:
  bun run upload-books-to-r2.ts <path>

Examples:
  # Upload a single book folder
  bun run upload-books-to-r2.ts ./books-data/alice-wonderland

  # Upload all books from a directory
  bun run upload-books-to-r2.ts ./books-data

Environment variables required:
  R2_ENDPOINT          - e.g., https://<account-id>.r2.cloudflarestorage.com
  R2_ACCESS_KEY_ID     - R2 access key
  R2_SECRET_ACCESS_KEY - R2 secret key
  R2_BUCKET            - R2 bucket name
`);
    process.exit(1);
  }

  const targetPath = args[0];
  const resolvedPath = path.resolve(targetPath);
  const stat = await fs.stat(resolvedPath);

  const hasEmbeddings = await fs.pathExists(path.join(resolvedPath, "embeddings.json"));

  if (hasEmbeddings) {
    console.log(`📤 Uploading single book: ${path.basename(resolvedPath)}\n`);
    const result = await uploadBookFolder(resolvedPath);
    if (result.success) {
      console.log(`\n✅ Successfully uploaded ${result.bookSlug}`);
    } else {
      console.error(`\n❌ Failed to upload ${result.bookSlug}: ${result.error}`);
      process.exit(1);
    }
  } else if (stat.isDirectory()) {
    await uploadAllBooks(resolvedPath);
  } else {
    console.error(`❌ Invalid path: ${targetPath}`);
    process.exit(1);
  }
}
