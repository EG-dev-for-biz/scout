import { create } from "zustand";

type CarStore = {
  thirdMode: boolean;
  firstPerson: boolean;

  setThirdMode: (thirdMode: boolean) => void;
  setFirstPerson: (firstPerson: boolean) => void;
};

export const useCarStore = create<CarStore>((set) => ({
  thirdMode: false,
  firstPerson: false,
  setThirdMode: (thirdMode) => set({ thirdMode }),
  setFirstPerson: (firstPerson) => set({ firstPerson }),
}));
