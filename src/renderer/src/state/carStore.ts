import { create } from "zustand";

type CarStore = {
  thirdMode: boolean;
  firstPerson: boolean;
  /** Signed m/s, published each frame from Car.tsx (positive = forward). */
  velocityMS: number;
  /** Absolute |velocity| normalized 0..1 against the maxSpeed constant. */
  velocityNorm: number;

  setThirdMode: (thirdMode: boolean) => void;
  setFirstPerson: (firstPerson: boolean) => void;
  setVelocity: (ms: number, norm: number) => void;
};

export const useCarStore = create<CarStore>((set) => ({
  thirdMode: false,
  firstPerson: false,
  velocityMS: 0,
  velocityNorm: 0,
  setThirdMode: (thirdMode) => set({ thirdMode }),
  setFirstPerson: (firstPerson) => set({ firstPerson }),
  setVelocity: (velocityMS, velocityNorm) =>
    set({ velocityMS, velocityNorm }),
}));
