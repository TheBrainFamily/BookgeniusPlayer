import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";
import { SearchResultsData } from "@/searchModal";

const MODAL_ID = "search-modal";

interface SearchModalState {
  isOpen: boolean;
  query: string;
  results: SearchResultsData | null;
  layoutView?: boolean;
  hideOverlay?: boolean;
  isLoading: boolean;

  openModal: (layoutView?: boolean, hideOverlay?: boolean, query?: string) => void;
  closeModal: () => void;
  setQuery: (query: string) => void;
  setResults: (results: SearchResultsData) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useSearchModal = create<SearchModalState>()(
  devtools(
    (set) => ({
      isOpen: false,
      query: "",
      results: null,
      layoutView: false,
      hideOverlay: false,
      isLoading: false,

      openModal: (layoutView, hideOverlay, query = "") => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          set({
            isOpen: true,
            layoutView,
            hideOverlay,
            query,
            isLoading: !!query.trim(),
            results: query.trim() ? { header: `Searching for "${query}"...`, items: [], isLoading: true } : null,
          });
        }
      },

      closeModal: () => {
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, query: "", results: null, isLoading: false });
      },

      setQuery: (query) => set({ query }),
      setResults: (results) => set({ results, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    { name: "search-modal" },
  ),
);
