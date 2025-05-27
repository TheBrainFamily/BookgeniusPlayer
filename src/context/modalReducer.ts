import { SearchResultsData } from "@/searchModal";
import { ModalType } from "./ModalContext";

export type ModalState = { currentModal: ModalType | null; searchResults: SearchResultsData | null; searchQuery: string };

export const initialModalState: ModalState = { currentModal: null, searchResults: null, searchQuery: "" };

export type ModalAction =
  | { type: "OPEN_CHARACTER_MODAL"; payload: { slug: string; isVideo: boolean; mediaSrc: string } }
  | { type: "OPEN_SEARCH_MODAL"; payload: { layoutView?: boolean; hideOverlay?: boolean; query?: string; isLoading?: boolean } }
  | { type: "OPEN_DEEP_RESEARCH_MODAL"; payload: { content?: string; layoutView?: boolean; hideOverlay?: boolean; isLoading?: boolean } }
  | { type: "OPEN_BOOK_CHAPTER_MODAL"; payload: { chapter?: number } }
  | { type: "OPEN_BOOK_MENU_MODAL" }
  | { type: "EDITOR_MODE_MODAL"; payload: { modalType: "edit-paragraph" | "add-character" | "remove-character"; onSubmit: (characterSlug?: string) => Promise<void> } }
  | { type: "CLOSE_MODAL" }
  | { type: "SET_SEARCH_QUERY"; payload: { query: string } }
  | { type: "SET_SEARCH_RESULTS"; payload: { results: SearchResultsData } };

export function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "OPEN_CHARACTER_MODAL":
      return {
        ...state,
        currentModal: { type: "character", slug: action.payload.slug, isVideo: action.payload.isVideo, mediaSrc: action.payload.mediaSrc },
        searchResults: null,
        searchQuery: "",
      };

    case "OPEN_SEARCH_MODAL":
      return {
        ...state,
        currentModal: {
          type: "search",
          layoutView: action.payload.layoutView,
          hideOverlay: action.payload.hideOverlay,
          query: action.payload.query || "",
          isLoading: action.payload.isLoading ?? false,
        },
        searchQuery: action.payload.query || state.searchQuery,
      };

    case "OPEN_DEEP_RESEARCH_MODAL":
      return {
        ...state,
        currentModal: {
          type: "deepResearch",
          content: action.payload.content,
          layoutView: action.payload.layoutView,
          hideOverlay: action.payload.hideOverlay,
          isLoading: action.payload.isLoading ?? false,
        },
        searchResults: null,
        searchQuery: "",
      };

    case "OPEN_BOOK_CHAPTER_MODAL":
      return { ...state, currentModal: { type: "bookChapter", chapter: action.payload.chapter }, searchResults: null, searchQuery: "" };

    case "OPEN_BOOK_MENU_MODAL":
      return { ...state, currentModal: { type: "bookMenu" }, searchResults: null, searchQuery: "" };

    case "EDITOR_MODE_MODAL":
      return { ...state, currentModal: { type: "editorMode", modalType: action.payload.modalType, onSubmit: action.payload.onSubmit }, searchResults: null, searchQuery: "" };

    case "CLOSE_MODAL":
      return { ...state, currentModal: null, searchResults: null, searchQuery: "" };

    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload.query };

    case "SET_SEARCH_RESULTS":
      return { ...state, searchResults: action.payload.results };

    default:
      return state;
  }
}
