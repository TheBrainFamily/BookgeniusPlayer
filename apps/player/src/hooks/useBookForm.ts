import { useBookConvex } from "@player/context/BookConvexContext";

export const useBookForm = () => {
  const { bookData, isPlayLayout } = useBookConvex();
  const bookForm = bookData?.metadata?.bookForm ?? "prose";

  return { isPlayFormat: isPlayLayout, bookForm };
};
