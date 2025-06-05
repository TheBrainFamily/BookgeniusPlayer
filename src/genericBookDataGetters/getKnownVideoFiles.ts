//TODO: we need to use book slug instead of hardcoded krolowa-sniegu
import { getKnownVideoFiles as getKnownVideoFilesInput } from "@/books/Krolowa-Sniegu/getKnownVideoFiles";

export const getKnownVideoFiles = (): string[] => {
  if (getKnownVideoFilesInput) {
    return getKnownVideoFilesInput();
  }

  throw new Error("getKnownVideoFiles should never be called at runtime");
};
