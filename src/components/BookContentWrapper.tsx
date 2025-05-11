import React from "react";
import { HighlightProvider } from "@/context/HighlightContext";

interface BookContentWrapperProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that provides the HighlightContext to all children
 * This allows for highlighting functionality across the application
 */
export const BookContentWrapper: React.FC<BookContentWrapperProps> = ({ children }) => {
  return <HighlightProvider>{children}</HighlightProvider>;
};
