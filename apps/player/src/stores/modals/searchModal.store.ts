import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useModalCoordinator } from "../modalCoordinator.store";
import { SearchResultsData } from "@player/searchModal";

const MODAL_ID = "search-modal";

interface SearchModalState {
  isOpen: boolean;
  query: string;
  results: SearchResultsData;
  layoutView: boolean;
  hideOverlay: boolean;
  isLoading: boolean;
  lastClickedAppearanceId?: string;

  openModal: (layoutView?: boolean, hideOverlay?: boolean, query?: string) => void;
  closeModal: () => void;
  clearModal: () => void;
  setQuery: (query: string) => void;
  setResults: (results: SearchResultsData) => void;
  setLoading: (isLoading: boolean) => void;
  setLastClickedAppearanceId: (appearanceId?: string) => void;
}

const EMPTY_RESULTS: SearchResultsData = { header: "", items: [], isLoading: false };

export const useSearchModal = create<SearchModalState>()(
  devtools(
    (set, get) => ({
      isOpen: false,
      query: "",
      results: EMPTY_RESULTS,
      layoutView: false,
      hideOverlay: false,
      isLoading: false,
      lastClickedAppearanceId: undefined,

      openModal: (layoutView = false, hideOverlay = false, query = "") => {
        const state = get();

        if (state.isOpen) {
          set({ query: query.trim() });
          return;
        }

        const coordinator = useModalCoordinator.getState();
        if (!coordinator.requestModalOpen(MODAL_ID)) return;

        set({
          isOpen: true,
          layoutView,
          hideOverlay,
          query: query.trim(),
          results: EMPTY_RESULTS,
          isLoading: false,
        });
      },

      closeModal: () => {
        // Content shift is now handled by SearchModalRenderer (via onExitComplete)
        const coordinator = useModalCoordinator.getState();
        coordinator.releaseModal(MODAL_ID);
        set({ isOpen: false, isLoading: false, lastClickedAppearanceId: undefined });
      },

      clearModal: () => {
        set({
          query: "",
          results: EMPTY_RESULTS,
          isLoading: false,
          lastClickedAppearanceId: undefined,
        });
      },

      setQuery: (query) => set({ query }),
      setResults: (results) => set({ results: { ...results, items: [...results.items] } }),
      setLoading: (isLoading) => set({ isLoading }),
      setLastClickedAppearanceId: (appearanceId) => set({ lastClickedAppearanceId: appearanceId }),
    }),
    { name: "search-modal" },
  ),
);
