import { BOOK_SLUGS } from "../consts";

export const getPictureFileNameForName = (name: string) => {
  return `${name.replace(/[\s()\\']+/g, "-").toLowerCase()}.png`;
};

export const knownMovingPictures = [
  "Ramzes",
  "Ramzes XII",
  "Sara",
  "Nikotris",
  "Amenhotep",
  "Brat Ramzesa",
  "Chłop egipski",
  "Eunana",
  "Herhor",
  "Nikotris",
  "Nitager",
  "Patrokles",
  "Pentuer",
  "Tutmozis",
  "Pieszczota",
  "Anupa",
  "Dagon",
  "Gedeon",
];

const knownEmotionalPictures = [];
export const getPictureFilePathForName = (name: string, bookSlug: BOOK_SLUGS) => {
  if (knownMovingPictures.includes(name)) {
    return `/${bookSlug}/${name.toLowerCase().replace(" ", "-")}-listens.mp4`;
  }
  return `/${bookSlug}/${getPictureFileNameForName(name)}`;
};

export const getMovingPictureFilePathForName = (name: string, bookSlug: BOOK_SLUGS) => {
  if (knownMovingPictures.includes(name)) {
    return `/${bookSlug}/${name.toLowerCase().replace(" ", "-")}-speaks.mp4`;
  } else {
    return getPictureFilePathForName(name, bookSlug);
  }
};
