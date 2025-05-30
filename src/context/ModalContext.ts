import { createContext } from "react";
import { SearchResultsData } from "@/searchModal";

// Different types of modals the application can display
export type ModalType =
  | { type: "character"; slug: string; isVideo: boolean; mediaSrc: string }
  | { type: "search"; layoutView?: boolean; hideOverlay?: boolean; query?: string; isLoading?: boolean }
  | { type: "deepResearch"; content?: string; layoutView?: boolean; hideOverlay?: boolean; isLoading?: boolean }
  | { type: "bookChapter"; chapter: number }
  | { type: "bookMenu" }
  | { type: "editorMode"; modalType: "edit-paragraph" | "add-character" | "remove-character"; onSubmit: (characterSlug?: string) => Promise<void> };

export interface ModalContextType {
  openCharacterDetailsModal: (slug: string, isVideo: boolean, mediaSrc: string) => void;
  openSearchModal: (layoutView?: boolean, hideOverlay?: boolean, query?: string) => void;
  openDeepResearchModal: (content?: string, layoutView?: boolean, hideOverlay?: boolean) => void;
  openBookChapterModal: (chapter?: number) => void;
  openBookMenuModal: () => void;
  openEditorModeModal: (modalType: "edit-paragraph" | "add-character" | "remove-character", onSubmit: (characterSlug?: string) => Promise<void>) => void;
  closeModal: () => void;
  currentModal: ModalType | null;
  performSearchInModal: (query: string) => void;
  searchQuery: string;
  searchResults: SearchResultsData | null;
}

export const ModalContext = createContext<ModalContextType | undefined>(undefined);
