import { getBookAssetUrl } from "./assetUrls";
import { getKnownVideoFiles } from "@player/state/bookDataStore";

export const getFileNameForName = (name: string) => {
  return `${name
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/"/g, "")
    .replace(/(\(|\))/g, "")}`;
};
export const getPictureFileNameForName = (name: string) => {
  return `${getFileNameForName(name)}.png`;
};

export const getListeningMediaFilePathForName = (
  name: string,
  _bookSlug: string,
  forceKnown = false,
) => {
  const listensPath = `${getFileNameForName(name)}-listens.mp4`;
  const knownVideos = getKnownVideoFiles();

  if (forceKnown || knownVideos.includes(listensPath)) {
    return getBookAssetUrl(listensPath);
  }
  return getBookAssetUrl(getPictureFileNameForName(name));
};

export const getTalkingMediaFilePathForName = (
  name: string,
  bookSlug: string,
  forceKnown = false,
) => {
  const speaksPath = `${getFileNameForName(name)}-speaks.mp4`;
  const knownVideos = getKnownVideoFiles();

  if (forceKnown || knownVideos.includes(speaksPath)) {
    return getBookAssetUrl(speaksPath);
  }
  return getListeningMediaFilePathForName(name, bookSlug);
};
