import { processVideoTasks } from "./auto-image-to-video";
import fs from "fs";

if (require.main === module) {
  (async () => {
    const bookTitle = process.argv[2];
    const temporaryOutputPath = `./books-data/${bookTitle}/temporary-output`;
    const videoOutputsPath = `./books-data/${bookTitle}/video-outputs`;

    const tasks = fs.readFileSync(`${temporaryOutputPath}/video-tasks-id.json`, "utf-8");
    await processVideoTasks(JSON.parse(tasks), videoOutputsPath);
  })();
}
