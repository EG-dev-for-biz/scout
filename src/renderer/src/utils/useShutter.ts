import { useCallback } from "react";
import { useCameraStore, fovToFocalLength } from "@/state/cameraStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useProjectStore } from "@/state/projectStore";
import { useTimeStore } from "@/state/timeStore";
import { useWeatherStore } from "@/state/weatherStore";
import { useSlateStore } from "@/state/slateStore";
import { captureCanvasSnapshot } from "./geminiRestyle";

// ---------------------------------------------------------------------------
// useShutter — shared capture hook
// ---------------------------------------------------------------------------
//
// Single source of truth for the "press the shutter" gesture. Called by:
//   - <ShutterButton> (the big in-viewport red button)
//   - the SPACE keyboard handler in <App>
//   - drive-mode's `F` keyboard handler (in Car.tsx)
//
// One pass does FOUR things at once so the user sees a single coherent
// moment of capture:
//   1. Grabs a thumbnail JPEG from the live canvas
//   2. Adds a new Shot pin with full camera snapshot + thumbnail
//   3. Selects the new pin (so ShotNotesDrawer auto-opens if mounted)
//   4. Fires a slate-burn event with all the cine metadata at the
//      moment of capture (focal length, f-stop, scene time, weather)
//
// The returned function is stable across renders (useCallback over
// store setters, which zustand guarantees are stable references).
// Calling it when no camera snapshot is available is a no-op — UI
// surfaces should disable themselves in that case for a clean "ready"
// state read.

interface ShutterOptions {
  /** Override the auto-generated "Shot N" name. */
  name?: string;
  /** Extra tags merged into the pin (besides the default "shot" tag). */
  tags?: string[];
  /** Extra description text appended to the focal-length blurb. */
  description?: string;
}

export function useShutter(): (opts?: ShutterOptions) => string | null {
  const addPin = useAnnotationStore((s) => s.addPin);
  const selectPin = useAnnotationStore((s) => s.selectPin);
  const markDirty = useProjectStore((s) => s.markDirty);

  return useCallback(
    (opts?: ShutterOptions) => {
      const current = useCameraStore.getState().current;
      if (!current) return null;

      const focalMM = Math.round(fovToFocalLength(current.fov));
      const cam = useCameraStore.getState();
      const fStop = cam.dofEnabled ? cam.apertureF : null;

      // Thumbnail. captureCanvasSnapshot returns null when no canvas is
      // available (e.g. during early mount). The shutter still fires and
      // creates the pin; the filmstrip falls back to a focal-length tile.
      const thumbnail = captureCanvasSnapshot(384) ?? undefined;

      const shotN = nextShotNumber();
      const baseDescription = `${focalMM}mm equivalent`;
      const description = opts?.description
        ? `${baseDescription} · ${opts.description}`
        : baseDescription;

      const id = addPin({
        name: opts?.name ?? `Shot ${shotN}`,
        type: "shot",
        position: {
          x: current.target[0],
          y: current.target[1],
          z: current.target[2],
        },
        camera: {
          position: current.position,
          target: current.target,
          fov: current.fov,
        },
        description,
        tags: ["shot", ...(opts?.tags ?? [])],
        thumbnail,
      });
      selectPin(id);
      markDirty();

      // Fire the slate-burn event. Snapshot the time + weather AT
      // the moment of capture so the slate reads as a record of that
      // exact frame, not whatever the user changes after.
      const date = useTimeStore.getState().date;
      const time = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      useSlateStore.getState().fire({
        shotNumber: shotN,
        focalMM,
        fStop,
        time,
        wx: weatherSummary(),
      });

      return id;
    },
    [addPin, selectPin, markDirty]
  );
}

/**
 * Next shot number = count of existing shot-type pins + 1. Exposed for
 * UI that wants to PREVIEW the number before firing (e.g. a slate readout
 * on the shutter button itself).
 */
export function nextShotNumber(): number {
  const pins = useAnnotationStore.getState().pins;
  return pins.filter((p) => p.type === "shot").length + 1;
}

/**
 * Compact weather summary for the slate. Tries to match what a real
 * production slate would write in the conditions row.
 */
function weatherSummary(): string {
  const w = useWeatherStore.getState();
  const parts: string[] = [];

  if (w.precipitation.kind !== "none") {
    const kindLabel = w.precipitation.kind.toUpperCase();
    parts.push(`${kindLabel} ${Math.round(w.precipitation.intensity * 100)}%`);
  } else {
    parts.push("CLEAR");
  }

  if (w.fog.enabled && w.fog.density > 0.1) parts.push("FOG");
  if (w.haze.enabled && w.haze.amount > 0.4) parts.push("HAZE");

  // Wind only included when meaningful (> 3 m/s) to keep the slate short.
  if (w.wind.speed > 3) {
    parts.push(`${Math.round(w.wind.speed)} M/S`);
  }

  return parts.join(" · ");
}
