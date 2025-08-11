import { create } from 'zustand';

interface AppState {
  showVariants: boolean;
  setShowVariants: (show: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  showVariants: false,
  setShowVariants: (show: boolean) => set({ showVariants: show }),
}));