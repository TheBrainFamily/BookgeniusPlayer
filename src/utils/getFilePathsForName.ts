import { BOOK_SLUGS } from "@/consts";
import { getKnownVideoFiles } from "@/genericBookDataGetters/getKnownVideoFiles";

export const getPictureFileNameForName = (name: string) => {
  return `${name.replace(/[\s()\\']+/g, "-").toLowerCase()}.png`;
};

const knownVideos = getKnownVideoFiles();

export const getListeningMediaFilePathForName = (name: string, bookSlug: BOOK_SLUGS, forceKnown = false) => {
  const listensPath = `${name
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/"/g, "")
    .replace(/(\(|\))/g, "")}-listens.mp4`;

  if (forceKnown || knownVideos.includes(listensPath)) {
    return `/${bookSlug}/${listensPath}`;
  }
  return `/${bookSlug}/${getPictureFileNameForName(name)}`;
};

export const getTalkingMediaFilePathForName = (name: string, bookSlug: BOOK_SLUGS, forceKnown = false) => {
  const speaksPath = `${name
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/"/g, "")
    .replace(/(\(|\))/g, "")}-speaks.mp4`;

  if (forceKnown || knownVideos.includes(speaksPath)) {
    return `/${bookSlug}/${speaksPath}`;
  }
  return getListeningMediaFilePathForName(name, bookSlug);
};
