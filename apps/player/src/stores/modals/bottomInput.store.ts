import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface BottomInputState {
  value: string;

  setValue: (value: string) => void;
}

export const useBottomInput = create<BottomInputState>()(
  devtools((set) => ({
    value: "",

    setValue: (value: string) => set({ value }),
  })),
);
