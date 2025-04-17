import { BOOK_SLUGS } from "../consts";

export const getPictureFileNameForName = (name: string) => {
  return `${name.replace(/[\s()\\']+/g, "-").toLowerCase()}.png`;
};

export const getPictureFilePathForName = (name: string, bookSlug: BOOK_SLUGS) => {
  if (name === "Sara") {
    return `./public/${bookSlug}/sara-listens.gif`;
  }
  if (name === "Ramzes") {
    return `./public/${bookSlug}/ramzes-listens.gif`;
  }
  return `./public/${bookSlug}/${getPictureFileNameForName(name)}`;
};

export const getMovingPictureFilePathForName = (name: string, bookSlug: BOOK_SLUGS) => {
  if (name === "Sara") {
    return `./public/${bookSlug}/sara-speaks.gif`;
  }
  if (name === "Ramzes") {
    return `./public/${bookSlug}/ramzes-speaks.gif`;
  } else {
    return getPictureFilePathForName(name, bookSlug);
  }
};
