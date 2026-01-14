import { generateTagName } from "./generateTagName";

export const getPictureFileNameForName = (name: string) => {
  return `${generateTagName(name).toLowerCase()}.png`;
};

export const getPictureFilePathForName = (name: string, bookSlug: string) => {
  return `./public/${bookSlug}/${getPictureFileNameForName(name)}`;
};
