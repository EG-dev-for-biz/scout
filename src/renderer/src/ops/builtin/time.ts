import { defineOperator } from "../define";
import { useTimeStore } from "@/state/timeStore";
import { useAreaStore } from "@/state/areaStore";

/**
 * `time.set_hour` — set the scene's wall-clock hour (and optional
 * minute). The sun position derives from this when atmospheric or
 * solar lighting is enabled.
 */
export const SetHourOp = defineOperator({
  id: "time.set_hour",
  label: "Set Hour",
  description:
    "Set the scene's hour of day (0..23) and optional minute. Drives sun position when atmospheric or solar lighting is on. For golden hour, use `time.jump_to_golden_hour` instead.",
  flags: { undo: true },
  props: {
    hour: {
      kind: "int",
      default: 14,
      min: 0,
      max: 23,
      ui: { tooltip: "Hour of day, 0..23 (24-hour clock)." },
    },
    minute: {
      kind: "int",
      default: 0,
      min: 0,
      max: 59,
      ui: { tooltip: "Minute past the hour, 0..59." },
    },
  },
  exec(_ctx, props) {
    useTimeStore.getState().setHour(props.hour, props.minute);
    return { status: "finished" };
  },
});

export const JumpToGoldenHourOp = defineOperator({
  id: "time.jump_to_golden_hour",
  label: "Jump to Golden Hour",
  description:
    "Set the scene's time to the evening golden hour (sun at +6° altitude) for the current scene's geographic location. No-op if the sun never reaches +6° on this date (polar winter).",
  flags: { undo: true },
  props: {},
  exec() {
    const center = useAreaStore.getState().center[0];
    if (!center) {
      return { status: "cancelled", reason: "No scene location set — load an area first." };
    }
    useTimeStore.getState().jumpToGoldenHour(center.lat, center.lng);
    return { status: "finished" };
  },
});

export const SetAtmosphereOp = defineOperator({
  id: "time.set_atmosphere",
  label: "Set Atmosphere",
  description:
    "Enable / disable the takram atmospheric rig (physical sky + sun + aerial perspective + AGX tonemap). Turning ON also forces solar lighting on.",
  flags: { undo: true },
  props: {
    enabled: { kind: "bool", default: true, ui: { tooltip: "Whether the atmospheric rig is active." } },
  },
  exec(_ctx, props) {
    useTimeStore.getState().setAtmosphereEnabled(props.enabled);
    return { status: "finished" };
  },
});

export const SetCloudsOp = defineOperator({
  id: "time.set_clouds",
  label: "Set Clouds",
  description:
    "Enable / disable volumetric clouds (requires atmosphere on). `coverage` (0..1) controls how much sky is overcast.",
  flags: { undo: true },
  props: {
    enabled: { kind: "bool", default: true, ui: { tooltip: "Whether clouds are rendered." } },
    coverage: {
      kind: "float",
      default: 0.4,
      min: 0,
      max: 1,
      ui: { tooltip: "Cloud coverage 0..1 (0=clear, 1=overcast)." },
    },
  },
  exec(_ctx, props) {
    const t = useTimeStore.getState();
    t.setCloudsEnabled(props.enabled);
    t.setCloudCoverage(props.coverage);
    return { status: "finished" };
  },
});

export const SetShadowsOp = defineOperator({
  id: "time.set_shadows",
  label: "Set Shadows",
  description: "Enable / disable shadow casting from the sun on scene geometry.",
  flags: { undo: true },
  props: {
    enabled: { kind: "bool", default: true, ui: { tooltip: "Whether shadows are rendered." } },
  },
  exec(_ctx, props) {
    useTimeStore.getState().setShadowsEnabled(props.enabled);
    return { status: "finished" };
  },
});

export const SetLensFlareOp = defineOperator({
  id: "time.set_lens_flare",
  label: "Set Lens Flare",
  description:
    "Toggle and tune the takram chromatic lens-flare effect. `intensity` (0..1) drives both the bloom halo and the streaks together.",
  flags: { undo: true },
  props: {
    enabled: { kind: "bool", default: true, ui: { tooltip: "Whether lens flare is rendered." } },
    intensity: {
      kind: "float",
      default: 0.35,
      min: 0,
      max: 1,
      ui: { tooltip: "Flare strength 0..1." },
    },
  },
  exec(_ctx, props) {
    const t = useTimeStore.getState();
    t.setLensFlareEnabled(props.enabled);
    t.setLensFlareIntensity(props.intensity);
    return { status: "finished" };
  },
});
