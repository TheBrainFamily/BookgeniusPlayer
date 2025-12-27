import { resolveBookDir } from "./resolveBookDir";
import path from "path";

export enum FILE_TYPE {
  INPUT = "input",
  TEMPORARY = "temporary-output",
  PERMANENT = "output",
}

export function getFilePath(fileName: string, fileType: FILE_TYPE) {
  // PINGWING: you can easily hardcode the book path below by replacing baseBookDirectory
  const baseBookDirectory = resolveBookDir();

  const outputDirectory = fileType;
  const fileFullPath = path.join(baseBookDirectory, outputDirectory, fileName);

  return fileFullPath;
}
