import fs from "fs";
import { FILE_TYPE, getFilePath } from "./filesHelpers";

// TODO: if temporary-output dir doesn't exist create it

export function writeBookFile(
  fileName: string,
  content: string | Buffer<ArrayBufferLike>,
  fileType: FILE_TYPE = FILE_TYPE.TEMPORARY,
) {
  const fileFullPath = getFilePath(fileName, fileType);

  // Ensure the directory exists
  const directory = fileFullPath.substring(0, fileFullPath.lastIndexOf("/"));
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  fs.writeFileSync(fileFullPath, content);
  return fileFullPath;
}
