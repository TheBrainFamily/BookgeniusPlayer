import { BOOK_SLUGS } from "../consts";

export const getPictureFileNameForName = (name: string) => {
  return `${name.replace(/[\s()\\']+/g, "-").toLowerCase()}.png`;
};

export const getPictureFilePathForName = (name: string, bookSlug: BOOK_SLUGS) => {
  return `./public/${bookSlug}/${getPictureFileNameForName(name)}`;
};

export const getMovingPictureFilePathForName = (name: string, bookSlug: BOOK_SLUGS) => {
  if (name === "Ramzes") {
    return getPictureFilePathForName(name, bookSlug).replace(".png", ".gif");
  } else {
    return getPictureFilePathForName(name, bookSlug);
  }
};
