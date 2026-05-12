import { defineOperator } from "../define";
import { useAreaStore } from "@/state/areaStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useStyleStore } from "@/state/styleStore";
import { useWeatherStore } from "@/state/weatherStore";
import { useTimeStore } from "@/state/timeStore";
import { useCameraStore, fovToFocalLength } from "@/state/cameraStore";
import { useRenderModeStore } from "@/state/renderModeStore";
import { useViewportStore } from "@/state/viewportStore";

/**
 * `scene.describe` — one-shot summary of the entire scene state.
 *
 * This is the AI's grounding tool. Before it picks a weather preset
 * or moves the camera, it should call this once to know what's
 * currently in place. Returns a compact JSON snapshot of every
 * salient knob — location, time, weather, style, camera, pins.
 */
export const DescribeSceneOp = defineOperator({
  id: "scene.describe",
  label: "Describe Scene",
  description:
    "Read-only: full snapshot of the scene state — location, time, weather, render mode, style, camera, aspect ratio, and pin counts by type. Call this FIRST on any 'change the look' / 'frame this' prompt so you have ground truth instead of guessing.",
  flags: { readonly: true },
  props: {},
  exec() {
    const area = useAreaStore.getState();
    const ann = useAnnotationStore.getState();
    const style = useStyleStore.getState();
    const weather = useWeatherStore.getState();
    const time = useTimeStore.getState();
    const cam = useCameraStore.getState();
    const render = useRenderModeStore.getState();
    const viewport = useViewportStore.getState();

    const date = time.date;
    const pinsByType: Record<string, number> = {};
    for (const p of ann.pins) {
      pinsByType[p.type] = (pinsByType[p.type] ?? 0) + 1;
    }

    return {
      status: "finished",
      value: {
        location: area.center[0]
          ? { lat: area.center[0].lat, lng: area.center[0].lng }
          : null,
        loaded_area_count: area.areas.length,
        time: {
          iso: date.toISOString(),
          hour: date.getHours(),
          minute: date.getMinutes(),
          atmosphere_enabled: time.atmosphereEnabled,
          clouds_enabled: time.cloudsEnabled,
          cloud_coverage: time.cloudCoverage,
          shadows_enabled: time.shadowsEnabled,
          solar_lighting_enabled: time.solarLightingEnabled,
        },
        weather: {
          wind_deg: weather.wind.direction,
          wind_speed_mps: weather.wind.speed,
          fog_enabled: weather.fog.enabled,
          fog_density: weather.fog.density,
          haze_enabled: weather.haze.enabled,
          haze_amount: weather.haze.amount,
          precipitation_kind: weather.precipitation.kind,
          precipitation_intensity: weather.precipitation.intensity,
          wetness: weather.wetness,
          sun_strength: weather.sunStrength,
          god_rays_enabled: weather.godRays.enabled,
        },
        render_mode: render.mode,
        style_id: style.activeId,
        aspect_ratio: viewport.aspectRatio,
        camera: cam.current
          ? {
              fov_deg: cam.current.fov,
              focal_mm: Math.round(fovToFocalLength(cam.current.fov)),
              position: [...cam.current.position],
              target: [...cam.current.target],
              aperture_f: cam.apertureF,
              dof_enabled: cam.dofEnabled,
            }
          : null,
        pin_counts: {
          total: ann.pins.length,
          shot: pinsByType.shot ?? 0,
          location: pinsByType.location ?? 0,
          note: pinsByType.note ?? 0,
          hazard: pinsByType.hazard ?? 0,
        },
      },
    };
  },
});

/**
 * `scene.audit_shot` — opinionated completeness checklist. Borrows
 * the structural pattern of scratchbox's `core.scene_audit`: the model
 * is much more likely to keep tweaking when a tool result names
 * concrete `missing` items than when a prompt rule says "be thorough".
 *
 * Currently flags: no location loaded, no shot pin, no atmosphere /
 * style above the default, and weather still at "clear" — i.e. the
 * baseline state that a user wouldn't call "a mood".
 */
export const AuditShotOp = defineOperator({
  id: "scene.audit_shot",
  label: "Audit Shot",
  description:
    "Read-only completeness check for a 'build me a mood' style prompt. Returns a list of missing items. Call this BEFORE writing a final reply on any 'make it feel like X' prompt; if status === 'incomplete', keep calling tools until the missing list is satisfied.",
  flags: { readonly: true },
  props: {},
  exec() {
    const missing: string[] = [];
    const area = useAreaStore.getState();
    const ann = useAnnotationStore.getState();
    const style = useStyleStore.getState();
    const weather = useWeatherStore.getState();
    const time = useTimeStore.getState();
    const cam = useCameraStore.getState();

    if (area.areas.length === 0) {
      missing.push("no_location: use area.set_center then load an area to ground the scene");
    }
    if (!time.atmosphereEnabled && style.activeId === "realistic") {
      missing.push(
        "default_lighting: enable atmosphere (time.set_atmosphere) or apply a style preset (style.set_active) to give the shot character",
      );
    }
    if (
      weather.precipitation.kind === "none" &&
      !weather.fog.enabled &&
      !weather.haze.enabled &&
      weather.wetness < 0.05
    ) {
      missing.push(
        "no_weather_mood: apply a weather preset (weather.apply_preset) or enable fog/haze/precip — 'clear with no fog' reads as the baseline default",
      );
    }
    if (!cam.dofEnabled && cam.current && cam.current.fov < 50) {
      missing.push(
        "tight_lens_no_dof: telephoto framing benefits from depth of field — camera.set_dof + camera.set_aperture",
      );
    }
    const shotCount = ann.pins.filter((p) => p.type === "shot").length;
    if (shotCount === 0) {
      missing.push(
        "no_shot_pin: consider annotation.add_pin(type='shot') to bookmark the framing",
      );
    }

    return {
      status: "finished",
      value: {
        status: missing.length === 0 ? "complete" : "incomplete",
        missing,
        signal_counts: {
          loaded_areas: area.areas.length,
          shot_pins: shotCount,
          atmosphere_enabled: time.atmosphereEnabled,
          style: style.activeId,
        },
      },
    };
  },
});

/**
 * `area.set_center` — set the focal lat/lng for the scene. Does NOT
 * trigger an area load by itself (that's a more complex flow with
 * tile-fetch progress); it sets the anchor so any subsequent load
 * uses the new origin.
 */
export const SetSceneCenterOp = defineOperator({
  id: "area.set_center",
  label: "Set Scene Center",
  description:
    "Set the scene's geographic anchor (latitude, longitude). Drives the sun position math via `time.jump_to_golden_hour`. To load buildings around the new center, the user has to drop a pin on the in-app map.",
  flags: { undo: true },
  props: {
    latitude: {
      kind: "float",
      default: 40.8,
      min: -90,
      max: 90,
      ui: { unit: "°", tooltip: "Latitude in degrees, -90..90." },
    },
    longitude: {
      kind: "float",
      default: -73.95,
      min: -180,
      max: 180,
      ui: { unit: "°", tooltip: "Longitude in degrees, -180..180." },
    },
  },
  exec(_ctx, props) {
    const current = useAreaStore.getState().center;
    const next = [{ lat: props.latitude, lng: props.longitude }, ...current.slice(1)];
    useAreaStore.getState().setCenter(next);
    return { status: "finished" };
  },
});
