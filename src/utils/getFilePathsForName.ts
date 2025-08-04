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

let knownVideos;

export const setKnownVideos = (passedKnownVideos: string[]) => {
  knownVideos = passedKnownVideos;
};

export const getListeningMediaFilePathForName = (name: string, bookSlug: string, forceKnown = false) => {
  const listensPath = `${getFileNameForName(name)}-listens.mp4`;

  if (forceKnown || knownVideos.includes(listensPath)) {
    return `/books/${bookSlug}/assets/${listensPath}`;
  }
  return `/books/${bookSlug}/assets/${getPictureFileNameForName(name)}`;
};

export const getTalkingMediaFilePathForName = (name: string, bookSlug: string, forceKnown = false) => {
  const speaksPath = `${getFileNameForName(name)}-speaks.mp4`;

  if (forceKnown || knownVideos.includes(speaksPath)) {
    return `/books/${bookSlug}/assets/${speaksPath}`;
  }
  return getListeningMediaFilePathForName(name, bookSlug);
};
