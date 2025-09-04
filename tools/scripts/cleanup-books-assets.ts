import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const BUCKET_NAME = process.env.S3_BUCKET;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const KEEP_VERSIONS = parseInt(process.env.KEEP_VERSIONS || "5", 10);

if (!BUCKET_NAME) {
  throw new Error("S3_BUCKET environment variable is required");
}

if (!S3_ENDPOINT) {
  throw new Error("S3_ENDPOINT environment variable is required");
}

const s3 = new S3Client({
  region: "auto",
  endpoint: S3_ENDPOINT,
});

async function cleanupBookVersions() {
  const booksPrefix = "prod/assets/books/";

  const slugs = await listPrefixes(booksPrefix);

  for (const slug of slugs) {
    console.log(`Processing slug: ${slug}`);

    const versions = await listPrefixes(`${booksPrefix}${slug}`);

    const versionDirs = versions.filter(v => /^v\d{8}T\d{6}\/$/.test(v));

    if (versionDirs.length === 0) {
      console.log(`No version directories found for slug ${slug}`);
      continue;
    }

    const sorted = versionDirs.sort((a, b) => b.localeCompare(a));

    const toDelete = sorted.slice(KEEP_VERSIONS);

    if (toDelete.length === 0) {
      console.log(`Nothing to delete for slug ${slug}`);
      continue;
    }

    console.log(`Deleting ${toDelete.length} old versions from slug ${slug}`);

    for (const version of toDelete) {
      await deletePrefix(`${booksPrefix}${slug}${version}`);
    }
  }
}

async function listPrefixes(prefix: string): Promise<string[]> {
  let prefixes: string[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      Delimiter: "/",
      ContinuationToken: continuationToken,
    });

    const response = await s3.send(command);

    if (response.CommonPrefixes) {
      prefixes.push(
        ...response.CommonPrefixes.map(cp => cp.Prefix!.replace(prefix, ""))
      );
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return prefixes;
}

async function deletePrefix(prefix: string) {
  console.log(`Deleting prefix: ${prefix}`);
  let continuationToken: string | undefined = undefined;

  do {
    const listResp = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const objects = listResp.Contents?.map(obj => ({ Key: obj.Key! })) || [];

    if (objects.length > 0) {
      const deleteResult = await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: objects },
        })
      );

      if (deleteResult.Errors && deleteResult.Errors.length > 0) {
        console.error(`Failed to delete some objects in prefix ${prefix}:`);
        deleteResult.Errors.forEach(error => console.error(`- ${error.Key}: ${error.Message}`));
      }
    }

    continuationToken = listResp.NextContinuationToken;
  } while (continuationToken);
}

cleanupBookVersions().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
