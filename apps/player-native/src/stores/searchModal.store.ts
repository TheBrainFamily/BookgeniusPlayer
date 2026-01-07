import { create } from "zustand";

export interface SearchResultItem {
  chapter: number;
  paragraph: number;
  summary: string;
  id: string;
}

export interface SearchResults {
  header: string;
  items: SearchResultItem[];
  isLoading: boolean;
}

interface SearchModalState {
  isOpen: boolean;
  query: string;
  results: SearchResults;

  openModal: (query?: string) => void;
  closeModal: () => void;
  setQuery: (query: string) => void;
  setResults: (results: SearchResults) => void;
  setLoading: (isLoading: boolean) => void;
}

const EMPTY_RESULTS: SearchResults = { header: "", items: [], isLoading: false };

export const useSearchModal = create<SearchModalState>((set) => ({
  isOpen: false,
  query: "",
  results: EMPTY_RESULTS,

  openModal: (query = "") => {
    set({ isOpen: true, query, results: { ...EMPTY_RESULTS, isLoading: !!query } });
  },

  closeModal: () => {
    set({ isOpen: false });
  },

  setQuery: (query) => set({ query }),

  setResults: (results) => set({ results }),

  setLoading: (isLoading) => set((state) => ({ results: { ...state.results, isLoading } })),
}));
