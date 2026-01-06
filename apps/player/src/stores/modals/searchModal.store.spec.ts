import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { useSearchModal } from "./searchModal.store";

jest.mock("../modalCoordinator.store", () => ({
  useModalCoordinator: {
    getState: () => ({ requestModalOpen: () => true, releaseModal: () => {} }),
  },
}));

describe("searchModal store - flicker prevention", () => {
  beforeEach(() => {
    useSearchModal.setState({
      isOpen: false,
      query: "",
      results: { header: "", items: [], isLoading: false },
      layoutView: false,
      hideOverlay: false,
      isLoading: false,
      lastClickedAppearanceId: undefined,
    });
  });

  describe("openModal during active typing", () => {
    it("should NOT reset isLoading to false when modal is already open", () => {
      const { openModal, setResults } = useSearchModal.getState();

      openModal(true, true, "test");
      expect(useSearchModal.getState().isOpen).toBe(true);

      setResults({ header: "Searching...", items: [], isLoading: true });
      expect(useSearchModal.getState().results.isLoading).toBe(true);

      openModal(true, true, "test2");

      expect(useSearchModal.getState().results.isLoading).toBe(true);
    });

    it("should NOT reset results to EMPTY_RESULTS when modal is already open", () => {
      const { openModal, setResults } = useSearchModal.getState();

      openModal(true, true, "test");
      setResults({ header: "Searching...", items: [], isLoading: true });

      openModal(true, true, "testing");

      expect(useSearchModal.getState().results.header).toBe("Searching...");
    });

    it("should update query when modal is already open", () => {
      const { openModal } = useSearchModal.getState();

      openModal(true, true, "abc");
      expect(useSearchModal.getState().query).toBe("abc");

      openModal(true, true, "abcd");

      expect(useSearchModal.getState().query).toBe("abcd");
    });
  });

  describe("openModal for initial open", () => {
    it("should reset to empty results when opening fresh modal", () => {
      const { openModal } = useSearchModal.getState();

      expect(useSearchModal.getState().isOpen).toBe(false);

      openModal(true, true, "test");

      expect(useSearchModal.getState().isOpen).toBe(true);
      expect(useSearchModal.getState().results.items).toEqual([]);
      expect(useSearchModal.getState().results.isLoading).toBe(false);
    });
  });

  describe("state transition tracking", () => {
    it("should not have excessive isLoading state flips during simulated fast typing", () => {
      const { openModal, setResults } = useSearchModal.getState();

      const loadingStateHistory: boolean[] = [];

      const unsubscribe = useSearchModal.subscribe((state) => {
        loadingStateHistory.push(state.results.isLoading ?? false);
      });

      for (let i = 1; i <= 5; i++) {
        openModal(true, true, "a".repeat(i));
        setResults({ header: "Searching...", items: [], isLoading: true });
      }

      unsubscribe();

      let flips = 0;
      for (let i = 1; i < loadingStateHistory.length; i++) {
        if (loadingStateHistory[i] !== loadingStateHistory[i - 1]) {
          flips++;
        }
      }

      expect(flips).toBeLessThanOrEqual(2);
    });
  });
});
