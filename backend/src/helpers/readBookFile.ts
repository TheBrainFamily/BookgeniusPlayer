import fs from "fs";
import { FILE_TYPE, getFilePath } from "./filesHelpers";

export function readBookFile(fileName: string, fileType: FILE_TYPE = FILE_TYPE.INPUT) {
  const fileFullPath = getFilePath(fileName, fileType);

  return fs.readFileSync(fileFullPath, "utf8");
}

export function doesBookFileExist(fileName: string, fileType: FILE_TYPE = FILE_TYPE.INPUT) {
  const fileFullPath = getFilePath(fileName, fileType);

  if (!fs.existsSync(fileFullPath)) {
    return false;
  }

  return true
}
