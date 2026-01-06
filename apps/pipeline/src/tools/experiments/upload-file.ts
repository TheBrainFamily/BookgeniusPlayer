import "dotenv/config";
import { Bucket, Storage } from "@google-cloud/storage";

const storage = new Storage();

export const uploadFileToBucket = async (
  bucketName: string,
  pathString: string,
  fileName: string,
) => {
  try {
    const options = { destination: fileName, public: true };
    await storage.bucket(bucketName).upload(pathString, options);
  } catch (error) {
    throw new Error(`Could not upload file to bucket ${bucketName}: ${error}`);
  }
};

export const createBucketIfDoesNotExist = async (bucketName: string): Promise<Bucket> => {
  try {
    const bucketResponse = await storage.getBuckets();
    const buckets = bucketResponse[0];
    const bookBucket = buckets.find((bucket) => bucket.name === bucketName);
    if (!bookBucket) {
      await storage.createBucket(bucketName);
      return createBucketIfDoesNotExist(bucketName);
    }
    return bookBucket;
  } catch (error) {
    throw new Error(`Could not create bucket for bucket ${bucketName}: ${error}`);
  }
};

if (require.main === module) {
  (async () => {
    const bucketName = "1984-pics";
    const fileName = "openai-high-3.png";
    const pathString = `/Users/lukaszgandecki/projects/convert-books-trump/public/1984/backgrounds-soft/${fileName}`;
    await uploadFileToBucket(bucketName, pathString, fileName);
  })();
}
