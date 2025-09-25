import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";
import { useContentShift } from "../contentShift.store";
import { SearchResultsData } from "@player/searchModal";

const MODAL_ID = "search-modal";

interface SearchModalState {
  isOpen: boolean;
  query: string;
  results: SearchResultsData | null;
  layoutView?: boolean;
  hideOverlay?: boolean;
  isLoading: boolean;

  openModal: (layoutView?: boolean, hideOverlay?: boolean, query?: string, results?: SearchResultsData) => void;
  closeModal: () => void;
  clearModal: () => void;
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

      openModal: (layoutView, hideOverlay, query = "", results = { header: `Searching for "${query}"...`, items: [], isLoading: true }) => {
        const coordinator = useModalCoordinator.getState();
        if (coordinator.requestModalOpen(MODAL_ID)) {
          // Enable content shift if opening in layout view
          if (layoutView) {
            useContentShift.getState().enableContentShift();
          }

          set({ isOpen: true, layoutView, hideOverlay, query, isLoading: !!query.trim(), results });
        }
      },

      closeModal: () => {
        // Disable content shift when closing modal
        useContentShift.getState().disableContentShift();

        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, isLoading: false });
      },

      clearModal: () => {
        set({ query: "", results: null, isLoading: false });
      },

      setQuery: (query) => set({ query }),
      setResults: (results) => set({ results, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    { name: "search-modal" },
  ),
);
