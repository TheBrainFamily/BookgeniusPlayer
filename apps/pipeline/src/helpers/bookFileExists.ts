import fs from "fs";
import { FILE_TYPE, getFilePath } from "./filesHelpers";

// I assume here that we check if file exists most often for TEMPORARTY files, but you can always pass the parameter
export function bookFileExists(fileName: string, fileType: FILE_TYPE = FILE_TYPE.TEMPORARY) {
  const fileFullPath = getFilePath(fileName, fileType);

  return fs.existsSync(fileFullPath);
}
