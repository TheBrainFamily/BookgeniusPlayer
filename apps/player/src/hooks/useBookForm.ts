import { useBookConvex } from "@player/context/BookConvexContext";

export const useBookForm = () => {
  const { bookData } = useBookConvex();
  const bookForm = bookData?.metadata?.bookForm ?? "prose";
  const isPlayFormat = bookForm === "play" || bookForm === "mixed";

  return { isPlayFormat, bookForm };
};
