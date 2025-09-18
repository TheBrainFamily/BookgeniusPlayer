import { useEffect, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { books } from "@platform/books";

const DynamicDocumentTitle = () => {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const bookSlug = searchParams.get("book");

  const bookTitle = useMemo(() => {
    if (!pathname.startsWith("/reader")) return null;
    if (!bookSlug) return null;

    const book = books.find((entry) => entry.slug === bookSlug);
    return book?.title ?? bookSlug;
  }, [pathname, bookSlug]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const baseTitle = t("hero.bookGenius");

    if (bookTitle) {
      document.title = `${baseTitle} - ${bookTitle}`;
      return;
    }

    document.title = `${baseTitle} - ${t("title")}`;
  }, [bookTitle, t]);

  return null;
};

export default DynamicDocumentTitle;
