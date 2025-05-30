import React from "react";
import { HighlightProvider } from "@/context/HighlightContext";

interface BookContentWrapperProps {
  children: React.ReactNode;
}

export const BookContentWrapper: React.FC<BookContentWrapperProps> = ({ children }) => {
  return <HighlightProvider>{children}</HighlightProvider>;
};
