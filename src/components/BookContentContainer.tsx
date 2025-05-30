// BookContentContainer.tsx - New component that renders the actual content
import React from "react";
import { BookData } from "@/booksData/types";
import { BookChapterRenderer } from "@/BookChapterRenderer";

interface BookContentContainerProps {
  bookData: BookData;
}

export const BookContentContainer: React.FC<BookContentContainerProps> = ({ bookData }) => {
  return <BookChapterRenderer bookData={bookData} />;
};
