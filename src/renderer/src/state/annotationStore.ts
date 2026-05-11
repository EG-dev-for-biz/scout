import { create } from "zustand";

export type PinType = "shot" | "location" | "note" | "hazard";

/** Full camera snapshot — used by Shot pins for "Frame this shot" recall. */
export interface PinCameraSnapshot {
  position: [number, number, number];
  target: [number, number, number];
  /** Vertical FOV in degrees. */
  fov: number;
}

export interface AnnotationPin {
  id: string;
  name: string;
  type: PinType;
  position: { x: number; y: number; z: number };
  /** Legacy field — kept for backwards compatibility with v1.0/v1.1 projects. */
  cameraAngle?: { x: number; y: number; z: number };
  /** Full camera snapshot. Present on Shot pins captured from previs camera. */
  camera?: PinCameraSnapshot;
  description: string;
  tags: string[];
  color: string;
  createdAt: string;
  /**
   * Captured viewport thumbnail at the moment the shutter fired — a
   * downscaled JPEG data URL (~5 KB). Present only on Shot pins
   * captured via <ShutterButton>. Older Shot pins or non-shot pins
   * just don't have it; consumers render a focal-length-only tile.
   */
  thumbnail?: string;
}

export const PIN_TYPE_COLORS: Record<PinType, string> = {
  shot: "#3b82f6",
  location: "#22c55e",
  note: "#f59e0b",
  hazard: "#ef4444",
};

type AnnotationStore = {
  pins: AnnotationPin[];
  selectedPinId: string | null;

  addPin: (pin: Omit<AnnotationPin, "id" | "createdAt" | "color">) => string;
  updatePin: (id: string, updates: Partial<AnnotationPin>) => void;
  removePin: (id: string) => void;
  selectPin: (id: string | null) => void;
  clearPins: () => void;
  setPins: (pins: AnnotationPin[]) => void;
};

function generateId(): string {
  return `pin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useAnnotationStore = create<AnnotationStore>((set) => ({
  pins: [],
  selectedPinId: null,

  addPin: (pin) => {
    const id = generateId();
    const color = PIN_TYPE_COLORS[pin.type];
    const full: AnnotationPin = {
      ...pin,
      id,
      color,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ pins: [...state.pins, full] }));
    return id;
  },

  updatePin: (id, updates) =>
    set((state) => ({
      pins: state.pins.map((p) => {
        if (p.id !== id) return p;
        const merged = { ...p, ...updates };
        if (updates.type) merged.color = PIN_TYPE_COLORS[updates.type];
        return merged;
      }),
    })),

  removePin: (id) =>
    set((state) => ({
      pins: state.pins.filter((p) => p.id !== id),
      selectedPinId: state.selectedPinId === id ? null : state.selectedPinId,
    })),

  selectPin: (id) => set({ selectedPinId: id }),

  clearPins: () => set({ pins: [], selectedPinId: null }),

  setPins: (pins) => set({ pins }),
}));
