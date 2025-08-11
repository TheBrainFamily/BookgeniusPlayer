import { create } from 'zustand';

interface AppState {
  showVariants: boolean;
  setShowVariants: (show: boolean) => void;
  selectedSpanId: string | null;
  selectedSpanText: string | null;
  setSelectedSpan: (spanId: string | null, spanText?: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  showVariants: false,
  setShowVariants: (show: boolean) => set((state) => ({
    showVariants: show,
    // Clear selected span when turning off variants
    selectedSpanId: show ? state.selectedSpanId : null,
    selectedSpanText: show ? state.selectedSpanText : null
  })),
  selectedSpanId: null,
  selectedSpanText: null,
  setSelectedSpan: (spanId: string | null, spanText: string | null = null) => set({ 
    selectedSpanId: spanId,
    selectedSpanText: spanText 
  }),
}));