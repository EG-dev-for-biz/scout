import { create } from "zustand";

// ---------------------------------------------------------------------------
// Weather + atmospheric medium state
// ---------------------------------------------------------------------------
//
// One store, six knobs. Single source of truth for everything between the
// sky and the ground — wind, ground fog, sun-coupled haze, screen-space god
// rays, precipitation particles, and surface wetness.
//
// Consumed by:
//   - AtmosphericRig.tsx and PostFX.tsx (custom postprocessing effects)
//   - Precipitation.tsx (instanced particle column around the camera)
//   - Building/SatelliteGround materials (wetness uniform)
//   - Clouds (wind → localWeatherVelocity)
//
// Everything is gated by per-feature `enabled` flags so a project can be
// loaded with weather defaults and the user pays zero render cost until
// they opt-in.

export type Precipitation =
  | "none"
  | "drizzle"
  | "rain"
  | "heavy"
  | "snow"
  | "snowstorm";

export interface Wind {
  /** Compass direction the wind blows TOWARD, degrees clockwise from north. */
  direction: number;
  /** Wind speed in m/s. 0..30 covers light breeze through hurricane. */
  speed: number;
}

export interface FogState {
  enabled: boolean;
  /** RGB hex; mixed with sun-coupled tint in the shader. */
  color: string;
  /** 0..1 — peak density at the lowest layer. */
  density: number;
  /** Top of the fog layer in meters above the ground reference. */
  heightTop: number;
  /** Exponential falloff scale in meters. */
  heightFalloff: number;
}

export interface HazeState {
  enabled: boolean;
  /** 0..2 multiplier on global atmospheric haze (sun-tinted). */
  amount: number;
  /** RGB hex; mixed with the sun direction in the shader. */
  tint: string;
}

export interface GodRaysState {
  enabled: boolean;
  /** 0..1; how dense the light shafts read. */
  density: number;
  /** 0..1; how quickly intensity falls off per sample step. */
  decay: number;
  /** 0..1; per-sample exposure boost on the radial blur. */
  exposure: number;
  /** Internal radial-blur sample weight (0..1). */
  weight: number;
  /** Number of samples along each radial ray (more = smoother, slower). */
  samples: number;
}

export interface PrecipitationState {
  kind: Precipitation;
  /** 0..1; scales particle count and fall speed. */
  intensity: number;
}

interface WeatherStore {
  wind: Wind;
  fog: FogState;
  haze: HazeState;
  godRays: GodRaysState;
  precipitation: PrecipitationState;
  /** 0..1; drops material roughness and biases ground specular toward mirror. */
  wetness: number;
  /**
   * When true, dialing precipitation up auto-raises wetness; checked by
   * the WeatherControls UI which applies the link in its setter. Kept in
   * the store so a project load with auto-link disabled survives a round
   * trip.
   */
  autoLinkWetness: boolean;
  /**
   * Multiplier on the sun's contribution to scene illumination.
   * 1.0 = unmodified physical / preset lighting. Above 1.0 adds a
   * supplemental directional light + ambient fill; below 1.0 dims both.
   * Applies in atmospheric and legacy render paths. Range ~0..3.
   */
  sunStrength: number;

  setWindDirection: (deg: number) => void;
  setWindSpeed: (mps: number) => void;
  setWind: (wind: Partial<Wind>) => void;

  setFog: (patch: Partial<FogState>) => void;
  setHaze: (patch: Partial<HazeState>) => void;
  setGodRays: (patch: Partial<GodRaysState>) => void;
  setPrecipitation: (patch: Partial<PrecipitationState>) => void;
  setWetness: (v: number) => void;
  setAutoLinkWetness: (v: boolean) => void;
  setSunStrength: (v: number) => void;

  /** Apply a named atmospheric preset (Clear, Marine layer, Smog, etc.). */
  applyPreset: (id: WeatherPresetId) => void;
  /** Replace the full state — used by bookmarkStore.restore. */
  setAll: (state: WeatherSnapshot) => void;
}

export interface WeatherSnapshot {
  wind: Wind;
  fog: FogState;
  haze: HazeState;
  godRays: GodRaysState;
  precipitation: PrecipitationState;
  wetness: number;
  autoLinkWetness: boolean;
  sunStrength: number;
}

// ---------------------------------------------------------------------------
// Defaults & presets
// ---------------------------------------------------------------------------

export const DEFAULT_WEATHER: WeatherSnapshot = {
  wind: { direction: 270, speed: 3 },
  fog: {
    enabled: false,
    color: "#c8d4e0",
    density: 0.35,
    heightTop: 60,
    heightFalloff: 18,
  },
  haze: {
    enabled: false,
    amount: 0.4,
    tint: "#d8c9a6",
  },
  godRays: {
    enabled: false,
    // Conservative defaults — visible but not overpowering. Slider
    // ranges in WeatherControls cap exposure at 0.6 because anything
    // higher washes the entire frame into a radial smear.
    density: 0.93,
    decay: 0.96,
    exposure: 0.25,
    weight: 0.4,
    samples: 48,
  },
  precipitation: { kind: "none", intensity: 0.5 },
  wetness: 0,
  autoLinkWetness: true,
  sunStrength: 1,
};

export type WeatherPresetId =
  | "clear"
  | "marineLayer"
  | "valleyMist"
  | "smog"
  | "wildfire"
  | "humid"
  | "storm"
  | "snowDay"
  | "afterRain";

export const WEATHER_PRESETS: {
  id: WeatherPresetId;
  label: string;
  description: string;
  snapshot: WeatherSnapshot;
}[] = [
  {
    id: "clear",
    label: "Clear",
    description: "Calm, dry, neutral. The default.",
    snapshot: DEFAULT_WEATHER,
  },
  {
    id: "marineLayer",
    label: "Marine layer",
    description: "Low cool fog hugging the streets, light onshore breeze.",
    snapshot: {
      ...DEFAULT_WEATHER,
      wind: { direction: 240, speed: 5 },
      fog: {
        enabled: true,
        color: "#b8c4d0",
        density: 0.6,
        heightTop: 50,
        heightFalloff: 14,
      },
    },
  },
  {
    id: "valleyMist",
    label: "Valley mist",
    description: "Thin warm mist clinging to the ground, dawn-tinted.",
    snapshot: {
      ...DEFAULT_WEATHER,
      wind: { direction: 90, speed: 1 },
      fog: {
        enabled: true,
        color: "#e6dccb",
        density: 0.45,
        heightTop: 30,
        heightFalloff: 10,
      },
    },
  },
  {
    id: "smog",
    label: "Smog",
    description: "Heavy urban haze, dirty yellow tint, no wind to clear it.",
    snapshot: {
      ...DEFAULT_WEATHER,
      wind: { direction: 180, speed: 1 },
      haze: { enabled: true, amount: 1.4, tint: "#bfa66a" },
      fog: {
        enabled: true,
        color: "#9a8e6c",
        density: 0.18,
        heightTop: 200,
        heightFalloff: 80,
      },
    },
  },
  {
    id: "wildfire",
    label: "Wildfire",
    description: "Orange particulate haze, thick and sun-coupled.",
    snapshot: {
      ...DEFAULT_WEATHER,
      wind: { direction: 45, speed: 8 },
      haze: { enabled: true, amount: 1.8, tint: "#d97a3a" },
      fog: {
        enabled: true,
        color: "#a64a1e",
        density: 0.25,
        heightTop: 400,
        heightFalloff: 120,
      },
    },
  },
  {
    id: "humid",
    label: "Humid",
    description: "Soft mid-range haze, milky highlights.",
    snapshot: {
      ...DEFAULT_WEATHER,
      haze: { enabled: true, amount: 0.7, tint: "#d8d4cc" },
    },
  },
  {
    id: "storm",
    label: "Storm",
    description: "Heavy rain, strong gusts, wet streets.",
    snapshot: {
      ...DEFAULT_WEATHER,
      wind: { direction: 200, speed: 16 },
      precipitation: { kind: "heavy", intensity: 0.85 },
      wetness: 0.85,
      fog: {
        enabled: true,
        color: "#7a8290",
        density: 0.25,
        heightTop: 120,
        heightFalloff: 40,
      },
    },
  },
  {
    id: "snowDay",
    label: "Snow day",
    description: "Steady snow, light wind, dampened world.",
    snapshot: {
      ...DEFAULT_WEATHER,
      wind: { direction: 320, speed: 4 },
      precipitation: { kind: "snow", intensity: 0.6 },
      fog: {
        enabled: true,
        color: "#dde5ee",
        density: 0.3,
        heightTop: 80,
        heightFalloff: 20,
      },
    },
  },
  {
    id: "afterRain",
    label: "After rain",
    description: "Calm air, wet streets, fresh light. Cinematic gold.",
    snapshot: {
      ...DEFAULT_WEATHER,
      wind: { direction: 270, speed: 2 },
      wetness: 0.75,
      haze: { enabled: true, amount: 0.3, tint: "#cfd6dc" },
    },
  },
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export const useWeatherStore = create<WeatherStore>((set, get) => ({
  ...DEFAULT_WEATHER,

  setWindDirection: (deg) =>
    set((s) => ({ wind: { ...s.wind, direction: ((deg % 360) + 360) % 360 } })),
  setWindSpeed: (mps) =>
    set((s) => ({ wind: { ...s.wind, speed: clamp(mps, 0, 60) } })),
  setWind: (patch) => set((s) => ({ wind: { ...s.wind, ...patch } })),

  setFog: (patch) => set((s) => ({ fog: { ...s.fog, ...patch } })),
  setHaze: (patch) => set((s) => ({ haze: { ...s.haze, ...patch } })),
  setGodRays: (patch) =>
    set((s) => ({ godRays: { ...s.godRays, ...patch } })),

  setPrecipitation: (patch) => {
    const next = { ...get().precipitation, ...patch };
    set({ precipitation: next });
    // Auto-link wetness to precipitation intensity so the user doesn't have
    // to chase two sliders for the obvious "rain → wet streets" case. Only
    // raises wetness; never lowers it (so a user-set drier puddle level
    // isn't clobbered by light drizzle).
    if (get().autoLinkWetness && next.kind !== "none" && next.kind !== "snow") {
      const linked = clamp(next.intensity * 0.9, 0, 1);
      if (linked > get().wetness) set({ wetness: linked });
    }
  },

  setWetness: (v) => set({ wetness: clamp(v, 0, 1) }),
  setAutoLinkWetness: (autoLinkWetness) => set({ autoLinkWetness }),
  setSunStrength: (v) => set({ sunStrength: clamp(v, 0, 3) }),

  applyPreset: (id) => {
    const preset = WEATHER_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    set(preset.snapshot);
  },

  setAll: (state) => set(state),
}));

/**
 * Wind in scout3d's local frame. Returns [eastVelocity, northVelocity] in
 * m/s. The scene uses X=east, Y=up, Z=-north (Space.tsx project()), so the
 * "north" component lives on -Z. Consumers translate to Vector2/Vector3 as
 * appropriate.
 *
 * `direction` is the compass bearing the wind blows TOWARD: 0° = north,
 * 90° = east, 180° = south, 270° = west.
 */
export function windVelocityEastNorth(wind: Wind): [number, number] {
  const rad = (wind.direction * Math.PI) / 180;
  const east = wind.speed * Math.sin(rad);
  const north = wind.speed * Math.cos(rad);
  return [east, north];
}

/** Map a 0..359° bearing to N/NE/E/.../NW. */
export function compassFromBearing(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

/**
 * Particle count for the precipitation system. Pulled out so both the
 * Precipitation component and the docs can agree on the cap.
 */
export function precipitationParticleCount(state: PrecipitationState): number {
  if (state.kind === "none") return 0;
  const base = {
    drizzle: 2000,
    rain: 6000,
    heavy: 14000,
    snow: 4000,
    snowstorm: 12000,
  }[state.kind];
  return Math.round(base * (0.4 + state.intensity * 0.6));
}
