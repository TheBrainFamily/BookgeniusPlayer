import { getBookData } from "@player/genericBookDataGetters/getBookData";

export const useBookForm = () => {
  const {
    metadata: { bookForm },
  } = getBookData();

  const isPlayFormat = bookForm === "play" || bookForm === "mixed";

  return { isPlayFormat, bookForm };
};
