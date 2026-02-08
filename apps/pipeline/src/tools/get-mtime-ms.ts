import fs from "fs";
export const getMtimeMs = (path: string): number => {
  const stats = fs.statSync(path);
  return stats.mtimeMs;
};
