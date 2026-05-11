import { create } from "zustand";
import { findNamedSolarEvent } from "@/utils/solarPosition";

type TimeStore = {
  /** The scene's current Date (governs sun position). */
  date: Date;
  /** Whether time follows real-world wall clock. When true, `date` updates. */
  liveMode: boolean;
  /** Whether sun position drives lighting (vs. style preset's fixed sun). */
  solarLightingEnabled: boolean;

  // Atmospheric rendering (takram). When enabled, the entire scene is rendered
  // through the AtmosphericRig: physical sky + sun + sky-light + (optional)
  // volumetric clouds + aerial perspective + AGX tonemap. Replaces the
  // legacy drei <Sky>/<Environment> + manual lights + standalone <PostFX>.
  atmosphereEnabled: boolean;
  cloudsEnabled: boolean;
  cloudCoverage: number;
  shadowsEnabled: boolean;
  lensFlareEnabled: boolean;
  /**
   * Intensity (0..1) of the takram lens flare effect. Affects both the
   * bloom halo and the chromatic "features" streaks together — there's no
   * way to dim the streaks independently of the halo. Default kept low so
   * the screen-space streaks don't drag across nearby buildings.
   */
  lensFlareIntensity: number;
  ditheringEnabled: boolean;

  setDate: (date: Date) => void;
  setHour: (hour: number, minute?: number) => void;
  setLiveMode: (live: boolean) => void;
  setSolarLightingEnabled: (enabled: boolean) => void;
  setAtmosphereEnabled: (enabled: boolean) => void;
  setCloudsEnabled: (enabled: boolean) => void;
  setCloudCoverage: (coverage: number) => void;
  setShadowsEnabled: (enabled: boolean) => void;
  setLensFlareEnabled: (enabled: boolean) => void;
  setLensFlareIntensity: (v: number) => void;
  setDitheringEnabled: (enabled: boolean) => void;
  jumpToGoldenHour: (lat: number, lng: number) => void;
};

export const useTimeStore = create<TimeStore>((set, _get) => ({
  // Default to today at 14:00 (good lighting, sun is high)
  date: defaultStartDate(),
  liveMode: false,
  solarLightingEnabled: false,

  atmosphereEnabled: false,
  cloudsEnabled: false,
  cloudCoverage: 0.4,
  shadowsEnabled: true,
  lensFlareEnabled: true,
  // Subtle by default — the takram flare's chromatic streaks are screen-space
  // and don't respect occluders, so a strong flare drags ugly bands across
  // foreground buildings. The slider lets the user push it higher when the
  // sun is unoccluded.
  lensFlareIntensity: 0.35,
  ditheringEnabled: true,

  setDate: (date) => set({ date }),

  setHour: (hour, minute = 0) =>
    set((state) => {
      const d = new Date(state.date);
      d.setHours(hour, minute, 0, 0);
      return { date: d };
    }),

  setLiveMode: (liveMode) => set({ liveMode }),

  setSolarLightingEnabled: (enabled) => set({ solarLightingEnabled: enabled }),

  setAtmosphereEnabled: (enabled) =>
    set((state) => ({
      atmosphereEnabled: enabled,
      // Atmospheric rig always uses real solar position — keep the legacy
      // toggle in sync so the readouts agree.
      solarLightingEnabled: enabled ? true : state.solarLightingEnabled,
    })),
  setCloudsEnabled: (enabled) => set({ cloudsEnabled: enabled }),
  setCloudCoverage: (coverage) =>
    set({ cloudCoverage: Math.max(0, Math.min(1, coverage)) }),
  setShadowsEnabled: (enabled) => set({ shadowsEnabled: enabled }),
  setLensFlareEnabled: (enabled) => set({ lensFlareEnabled: enabled }),
  setLensFlareIntensity: (v) =>
    set({ lensFlareIntensity: Math.max(0, Math.min(1, v)) }),
  setDitheringEnabled: (enabled) => set({ ditheringEnabled: enabled }),

  jumpToGoldenHour: (lat, lng) =>
    set((state) => {
      // Real solver: find when the sun reaches +6° altitude on the descent
      // (evening golden hour) for the given lat/lng on the scene's current
      // calendar day. If golden hour doesn't occur (polar winter), leave
      // the time unchanged so the UI doesn't fight the user.
      const event = findNamedSolarEvent(state.date, lat, lng, "goldenHourEvening");
      return event ? { date: event } : {};
    }),
}));

function defaultStartDate(): Date {
  const d = new Date();
  d.setHours(14, 0, 0, 0);
  return d;
}
