import { config } from "dotenv";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");

const envPath = existsSync(join(rootDir, ".env")) ? join(rootDir, ".env") : join(rootDir, "backend/.env");

config({ path: envPath });

const toDeletePath = join(rootDir, "toDelete.json");
if (!existsSync(toDeletePath)) {
  console.error(`File not found: ${toDeletePath}`);
  process.exit(1);
}
const toDelete: string[] = JSON.parse(readFileSync(toDeletePath, "utf-8"));

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_ENDPOINT = process.env.R2_ENDPOINT;

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_ENDPOINT) {
  console.error("Missing R2 credentials in .env file");
  console.error(`Loaded .env from: ${envPath}`);
  process.exit(1);
}

const endpoint = R2_ENDPOINT.startsWith("http") ? R2_ENDPOINT : `https://${R2_ENDPOINT}`;

const s3 = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });

async function deleteKeys() {
  console.log(`Loaded .env from: ${envPath}`);
  console.log(`Deleting ${toDelete.length} orphaned R2 keys (batch mode)...`);
  console.log(`Bucket: ${R2_BUCKET}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log("");

  const batchSize = 1000;
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    try {
      const result = await s3.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true } }));
      const errors = result.Errors?.length ?? 0;
      deleted += batch.length - errors;
      failed += errors;
      if (errors > 0) {
        result.Errors?.forEach((e) => console.error(`  Failed: ${e.Key}: ${e.Message}`));
      }
    } catch (err: any) {
      console.error(`Batch failed: ${err.message}`);
      failed += batch.length;
    }
    console.log(`Progress: ${Math.min(i + batchSize, toDelete.length)}/${toDelete.length}`);
  }

  console.log("");
  console.log(`Done. Deleted: ${deleted}, Failed: ${failed}`);
}

deleteKeys();
