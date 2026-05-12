import { defineOperator } from "../define";
import type { EnumProp } from "../prop";
import {
  WEATHER_PRESETS,
  useWeatherStore,
  type Precipitation as PrecipitationKind,
  type WeatherPresetId,
} from "@/state/weatherStore";

/**
 * `weather.apply_preset` — load a named atmospheric preset.
 *
 * Presets are the easiest first move for a "make this stormy" / "after
 * the rain" prompt: one tool call sets wind, fog, haze, precipitation,
 * and wetness coherently. Fine-tuning happens through the individual
 * `weather.set_*` ops afterward.
 */
export const ApplyWeatherPresetOp = defineOperator({
  id: "weather.apply_preset",
  label: "Apply Weather Preset",
  description:
    "Apply a named atmospheric preset (clear, marine layer, smog, storm, etc.). Sets wind, fog, haze, precipitation, and wetness coherently. Use this BEFORE fine-tuning individual knobs.",
  flags: { undo: true },
  props: {
    id: {
      kind: "enum",
      default: "clear",
      values: WEATHER_PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
      })),
      ui: { tooltip: "Preset to apply." },
    } as EnumProp<WeatherPresetId>,
  },
  exec(_ctx, props) {
    useWeatherStore.getState().applyPreset(props.id);
    return { status: "finished", value: { applied: props.id } };
  },
});

export const SetWindOp = defineOperator({
  id: "weather.set_wind",
  label: "Set Wind",
  description:
    "Set wind direction (compass bearing in degrees, 0=N, 90=E, 180=S, 270=W) and speed (m/s). Wind affects cloud drift and precipitation slant.",
  flags: { undo: true },
  props: {
    direction_deg: {
      kind: "float",
      default: 270,
      min: 0,
      max: 360,
      ui: { unit: "°", tooltip: "Compass bearing the wind blows toward." },
    },
    speed_mps: {
      kind: "float",
      default: 3,
      min: 0,
      max: 60,
      ui: { unit: "m/s", tooltip: "Wind speed in metres per second (0..60)." },
    },
  },
  exec(_ctx, props) {
    const w = useWeatherStore.getState();
    w.setWindDirection(props.direction_deg);
    w.setWindSpeed(props.speed_mps);
    return { status: "finished" };
  },
});

export const SetFogOp = defineOperator({
  id: "weather.set_fog",
  label: "Set Fog",
  description:
    "Configure ground fog. `enabled` toggles the layer; `density` (0..1) is peak opacity near the ground; `height_top` (m) is the fog ceiling; `color_hex` is the fog tint as a #RRGGBB string.",
  flags: { undo: true },
  props: {
    enabled: {
      kind: "bool",
      default: true,
      ui: { tooltip: "Whether the fog layer is active." },
    },
    density: {
      kind: "float",
      default: 0.4,
      min: 0,
      max: 1,
      ui: { tooltip: "Peak opacity at the lowest layer (0..1)." },
    },
    height_top: {
      kind: "float",
      default: 60,
      min: 0,
      max: 400,
      ui: { unit: "m", tooltip: "Top of the fog layer above ground." },
    },
    color_hex: {
      kind: "string",
      default: "#c8d4e0",
      ui: { tooltip: "Fog tint as a #RRGGBB hex string." },
    },
  },
  exec(_ctx, props) {
    useWeatherStore.getState().setFog({
      enabled: props.enabled,
      density: props.density,
      heightTop: props.height_top,
      color: props.color_hex,
    });
    return { status: "finished" };
  },
});

export const SetHazeOp = defineOperator({
  id: "weather.set_haze",
  label: "Set Haze",
  description:
    "Configure global atmospheric haze. `amount` (0..2) scales the sun-coupled haze contribution; `tint_hex` mixes with the sun direction.",
  flags: { undo: true },
  props: {
    enabled: { kind: "bool", default: true, ui: { tooltip: "Whether haze is active." } },
    amount: {
      kind: "float",
      default: 0.4,
      min: 0,
      max: 2,
      ui: { tooltip: "Haze intensity multiplier (0..2)." },
    },
    tint_hex: {
      kind: "string",
      default: "#d8c9a6",
      ui: { tooltip: "Haze tint as a #RRGGBB hex string." },
    },
  },
  exec(_ctx, props) {
    useWeatherStore.getState().setHaze({
      enabled: props.enabled,
      amount: props.amount,
      tint: props.tint_hex,
    });
    return { status: "finished" };
  },
});

export const SetPrecipitationOp = defineOperator({
  id: "weather.set_precipitation",
  label: "Set Precipitation",
  description:
    "Set precipitation kind and intensity. Setting any rain kind with auto-link enabled also raises ground wetness automatically.",
  flags: { undo: true },
  props: {
    kind: {
      kind: "enum",
      default: "none",
      values: [
        { id: "none", description: "No precipitation." },
        { id: "drizzle", description: "Light drizzle." },
        { id: "rain", description: "Steady rain." },
        { id: "heavy", description: "Heavy downpour." },
        { id: "snow", description: "Falling snow." },
        { id: "snowstorm", description: "Heavy snow." },
      ],
      ui: { tooltip: "Type of precipitation." },
    } as EnumProp<PrecipitationKind>,
    intensity: {
      kind: "float",
      default: 0.5,
      min: 0,
      max: 1,
      ui: { tooltip: "Particle density / fall rate (0..1)." },
    },
  },
  exec(_ctx, props) {
    useWeatherStore
      .getState()
      .setPrecipitation({ kind: props.kind, intensity: props.intensity });
    return { status: "finished" };
  },
});

export const SetWetnessOp = defineOperator({
  id: "weather.set_wetness",
  label: "Set Wetness",
  description:
    "Set ground wetness (0..1). Drops material roughness and biases ground specular toward mirror. After-rain shots benefit from 0.6..0.9.",
  flags: { undo: true },
  props: {
    value: {
      kind: "float",
      default: 0,
      min: 0,
      max: 1,
      ui: { tooltip: "Wetness 0..1 (0=dry, 1=soaked)." },
    },
  },
  exec(_ctx, props) {
    useWeatherStore.getState().setWetness(props.value);
    return { status: "finished" };
  },
});

export const SetSunStrengthOp = defineOperator({
  id: "weather.set_sun_strength",
  label: "Set Sun Strength",
  description:
    "Multiply the sun's contribution to scene illumination. 1.0 = physical; above 1 brightens; below 1 dims. Range 0..3.",
  flags: { undo: true },
  props: {
    value: {
      kind: "float",
      default: 1,
      min: 0,
      max: 3,
      ui: { tooltip: "Sun multiplier (0..3)." },
    },
  },
  exec(_ctx, props) {
    useWeatherStore.getState().setSunStrength(props.value);
    return { status: "finished" };
  },
});

export const SetGodRaysOp = defineOperator({
  id: "weather.set_god_rays",
  label: "Set God Rays",
  description:
    "Toggle and tune screen-space god rays (radial light shafts from the sun). `density` and `exposure` are the main aesthetic knobs.",
  flags: { undo: true },
  props: {
    enabled: { kind: "bool", default: true, ui: { tooltip: "Whether god rays are active." } },
    density: {
      kind: "float",
      default: 0.93,
      min: 0,
      max: 1,
      ui: { tooltip: "Ray density (0..1). Higher = more visible shafts." },
    },
    exposure: {
      kind: "float",
      default: 0.25,
      min: 0,
      max: 0.6,
      ui: { tooltip: "Per-sample exposure (0..0.6). Above 0.4 risks washing the frame." },
    },
  },
  exec(_ctx, props) {
    useWeatherStore.getState().setGodRays({
      enabled: props.enabled,
      density: props.density,
      exposure: props.exposure,
    });
    return { status: "finished" };
  },
});
