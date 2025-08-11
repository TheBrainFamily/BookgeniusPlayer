import { create } from 'zustand';

interface AppState {
  showVariants: boolean;
  setShowVariants: (show: boolean) => void;
  selectedSpanId: string | null;
  setSelectedSpanId: (spanId: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  showVariants: false,
  setShowVariants: (show: boolean) => set((state) => ({
    showVariants: show,
    // Clear selected span ID when turning off variants
    selectedSpanId: show ? state.selectedSpanId : null
  })),
  selectedSpanId: null,
  setSelectedSpanId: (spanId: string | null) => set({ selectedSpanId: spanId }),
}));