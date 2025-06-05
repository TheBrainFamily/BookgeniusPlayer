export const getPictureFileNameForName = (name: string) => {
  return `${name.replace(/[\s()\\']+/g, "-").toLowerCase()}.png`;
};

let knownVideos;

export const setKnownVideos = (passedKnownVideos: string[]) => {
  knownVideos = passedKnownVideos;
};

export const getListeningMediaFilePathForName = (name: string, bookSlug: string, forceKnown = false) => {
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

export const getTalkingMediaFilePathForName = (name: string, bookSlug: string, forceKnown = false) => {
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
