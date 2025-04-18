import { BOOK_SLUGS } from "../consts";

export const getPictureFileNameForName = (name: string) => {
  return `${name.replace(/[\s()\\']+/g, "-").toLowerCase()}.png`;
};

const knownMovingPictures = [
  "Sara",
  "Ramzes",
  "Nikotris",
  "Amenhotep",
  "Brat Ramzesa",
  "Chłop Egipski",
  "Eunana",
  "Herhor",
  "Nikotris",
  "Nitager",
  "Patrokles",
  "Pentuer",
  "Ramzes XII",
  "Tutmozis",
];
export const getPictureFilePathForName = (name: string, bookSlug: BOOK_SLUGS) => {
  if (knownMovingPictures.includes(name)) {
    return `./public/${bookSlug}/${name.toLowerCase().replace(" ", "-")}-listens.gif`;
  }
  return `./public/${bookSlug}/${getPictureFileNameForName(name)}`;
};

export const getMovingPictureFilePathForName = (name: string, bookSlug: BOOK_SLUGS) => {
  if (knownMovingPictures.includes(name)) {
    return `./public/${bookSlug}/${name.toLowerCase()}-speaks.gif`;
  } else {
    return getPictureFilePathForName(name, bookSlug);
  }
};
