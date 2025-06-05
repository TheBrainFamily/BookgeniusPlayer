import { getKnownVideoFiles as getKnownVideoFilesInput } from "@/books/Krolowa-Sniegu-v2/getKnownVideoFiles";

export const getKnownVideoFiles = (): string[] => {
  if (getKnownVideoFilesInput) {
    return getKnownVideoFilesInput();
  }

  throw new Error("getKnownVideoFiles should never be called at runtime");
};
