import type { HighlightContextType } from "@/context/HighlightContext";
import { createContext, useContext } from "react";

export const HighlightContext = createContext<HighlightContextType | undefined>(undefined);

export const useHighlight = (): HighlightContextType => {
  const context = useContext(HighlightContext);
  if (context === undefined) {
    throw new Error("useHighlight must be used within a HighlightProvider");
  }
  return context;
};
