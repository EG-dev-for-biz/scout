import { create } from "zustand";
import { useTimeStore } from "./timeStore";
import { useStyleStore, STYLE_PRESETS } from "./styleStore";
import { useCinemaStore } from "./cinemaStore";
import { useCameraStore } from "./cameraStore";
import { useViewportStore, type AspectRatio } from "./viewportStore";
import {
  useWeatherStore,
  DEFAULT_WEATHER,
  type WeatherSnapshot,
} from "./weatherStore";

// ---------------------------------------------------------------------------
// Mood bookmarks — full scene-mood snapshots
// ---------------------------------------------------------------------------
//
// Each slot captures ALL knobs that affect the look of a shot: time,
// atmosphere, weather, cinema toolkit, camera optics, active style preset,
// and aspect ratio. Restoring a slot reproduces the exact mood with a
// single click — useful for A/B/C comparisons during a producer pitch or
// for saving "best case / realistic / worst case" weather for a scout.
//
// Slots are intentionally fixed-count (3) to keep the UI a row of tiles
// rather than a growing list. Each slot can be renamed and overwritten.

export interface MoodSnapshot {
  /** User-facing name. Auto-generated on first capture; renameable. */
  name: string;
  /** Optional downscaled JPEG dataURL captured from the canvas at save time. */
  thumbnail?: string;
  /** ISO timestamp when the slot was captured. */
  capturedAt: string;

  // --- time + sun ---
  sceneDate: string;
  solarLightingEnabled: boolean;

  // --- atmosphere (timeStore) ---
  atmosphereEnabled: boolean;
  cloudsEnabled: boolean;
  cloudCoverage: number;
  shadowsEnabled: boolean;
  lensFlareEnabled: boolean;
  lensFlareIntensity: number;
  ditheringEnabled: boolean;

  // --- weather (weatherStore) ---
  weather: WeatherSnapshot;

  // --- cinema (cinemaStore) ---
  lutEnabled: boolean;
  lutName: string | null;
  lutUrl: string | null;
  lutIntensity: number;

  // --- camera optics (cameraStore) ---
  apertureF: number;
  dofEnabled: boolean;
  userFovDeg: number;

  // --- style + viewport ---
  styleId: string;
  aspectRatio: AspectRatio;
}

interface BookmarkStore {
  /** Length-3, fixed. null = empty slot. */
  slots: (MoodSnapshot | null)[];

  /** Pull current state from every relevant store into the given slot. */
  capture: (idx: number, opts?: { name?: string; thumbnail?: string }) => void;
  /** Push the slot's state into every relevant store. No-op if empty. */
  restore: (idx: number) => void;
  /** Empty a slot. */
  clear: (idx: number) => void;
  /** Rename a filled slot. */
  rename: (idx: number, name: string) => void;
  /** Replace all slots (used by project loader). */
  setSlots: (slots: (MoodSnapshot | null)[]) => void;
}

const DEFAULT_SLOT_NAMES = ["Slot A", "Slot B", "Slot C"];

/**
 * Build a snapshot from the live state of every relevant store. Pure read
 * — does not mutate. Called by `capture` and exported for the project
 * serializer.
 */
export function captureLiveState(opts?: {
  name?: string;
  thumbnail?: string;
  fallbackName?: string;
}): MoodSnapshot {
  const time = useTimeStore.getState();
  const weather = useWeatherStore.getState();
  const cinema = useCinemaStore.getState();
  const cam = useCameraStore.getState();
  const style = useStyleStore.getState();
  const viewport = useViewportStore.getState();

  return {
    name: opts?.name ?? opts?.fallbackName ?? "Mood",
    thumbnail: opts?.thumbnail,
    capturedAt: new Date().toISOString(),

    sceneDate: time.date.toISOString(),
    solarLightingEnabled: time.solarLightingEnabled,

    atmosphereEnabled: time.atmosphereEnabled,
    cloudsEnabled: time.cloudsEnabled,
    cloudCoverage: time.cloudCoverage,
    shadowsEnabled: time.shadowsEnabled,
    lensFlareEnabled: time.lensFlareEnabled,
    lensFlareIntensity: time.lensFlareIntensity,
    ditheringEnabled: time.ditheringEnabled,

    weather: {
      wind: { ...weather.wind },
      fog: { ...weather.fog },
      haze: { ...weather.haze },
      godRays: { ...weather.godRays },
      precipitation: { ...weather.precipitation },
      wetness: weather.wetness,
      autoLinkWetness: weather.autoLinkWetness,
    },

    lutEnabled: cinema.lutEnabled,
    lutName: cinema.lutName,
    lutUrl: cinema.lutUrl,
    lutIntensity: cinema.lutIntensity,

    apertureF: cam.apertureF,
    dofEnabled: cam.dofEnabled,
    userFovDeg: cam.userFovDeg,

    styleId: style.activeId,
    aspectRatio: viewport.aspectRatio,
  };
}

/**
 * Apply a snapshot to every relevant store. Order matters: time and style
 * before weather (so weather doesn't visually flicker through a stale
 * preset), atmosphere flags before weather flags (so the atmospheric rig
 * remounts only once).
 */
export function applyMoodSnapshot(snap: MoodSnapshot): void {
  // Style first — restoring a style might force-toggle envPreset etc., and
  // we'd rather the user see weather settle on the final style, not on the
  // old one.
  const stylePreset = STYLE_PRESETS.find((p) => p.id === snap.styleId);
  if (stylePreset) useStyleStore.getState().setActive(stylePreset);

  useViewportStore.getState().setAspectRatio(snap.aspectRatio);

  // Time + atmosphere flags.
  const time = useTimeStore.getState();
  time.setDate(new Date(snap.sceneDate));
  time.setSolarLightingEnabled(snap.solarLightingEnabled);
  time.setAtmosphereEnabled(snap.atmosphereEnabled);
  time.setCloudsEnabled(snap.cloudsEnabled);
  time.setCloudCoverage(snap.cloudCoverage);
  time.setShadowsEnabled(snap.shadowsEnabled);
  time.setLensFlareEnabled(snap.lensFlareEnabled);
  time.setLensFlareIntensity(snap.lensFlareIntensity);
  time.setDitheringEnabled(snap.ditheringEnabled);

  // Weather — replace wholesale.
  useWeatherStore.getState().setAll(snap.weather);

  // Cinema.
  const cinema = useCinemaStore.getState();
  if (snap.lutName && snap.lutUrl) {
    cinema.setLut(snap.lutName, snap.lutUrl);
    cinema.setLutEnabled(snap.lutEnabled);
    cinema.setLutIntensity(snap.lutIntensity);
  } else {
    cinema.clearLut();
  }

  // Camera optics.
  const cam = useCameraStore.getState();
  cam.setApertureF(snap.apertureF);
  cam.setDofEnabled(snap.dofEnabled);
  // setLensFocalMM derives the FOV; we want to set FOV directly to round
  // trip identically when the user picked an exact slider value. There's
  // no direct setter, so use the closest path — recover the focal length
  // from the FOV (math is invertible) and set via setLensFocalMM.
  const sensorH = 24;
  const halfFov = (snap.userFovDeg / 2) * (Math.PI / 180);
  const focalMM = sensorH / 2 / Math.tan(halfFov);
  cam.setLensFocalMM(focalMM);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBookmarkStore = create<BookmarkStore>((set, get) => ({
  slots: [null, null, null],

  capture: (idx, opts) => {
    if (idx < 0 || idx >= 3) return;
    const snap = captureLiveState({
      name: opts?.name ?? get().slots[idx]?.name ?? DEFAULT_SLOT_NAMES[idx],
      thumbnail: opts?.thumbnail,
    });
    set((s) => {
      const next = [...s.slots];
      next[idx] = snap;
      return { slots: next };
    });
  },

  restore: (idx) => {
    const snap = get().slots[idx];
    if (!snap) return;
    applyMoodSnapshot(snap);
  },

  clear: (idx) =>
    set((s) => {
      const next = [...s.slots];
      next[idx] = null;
      return { slots: next };
    }),

  rename: (idx, name) =>
    set((s) => {
      const next = [...s.slots];
      const slot = next[idx];
      if (!slot) return s;
      next[idx] = { ...slot, name };
      return { slots: next };
    }),

  setSlots: (slots) => {
    // Normalize to length 3 — older project files may have fewer entries.
    const padded: (MoodSnapshot | null)[] = [null, null, null];
    for (let i = 0; i < Math.min(3, slots.length); i++) padded[i] = slots[i];
    set({ slots: padded });
  },
}));

// Safety: re-export to keep import sites pleasant. Unused locally but
// makes `import { DEFAULT_WEATHER } from '@/state/bookmarkStore'` work for
// any future caller migrating defaults.
export { DEFAULT_WEATHER };
