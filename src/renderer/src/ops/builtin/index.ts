import type { OperatorRegistry } from "../registry";
import type { UndoStack } from "../undo";

import {
  ApplyWeatherPresetOp,
  SetFogOp,
  SetGodRaysOp,
  SetHazeOp,
  SetPrecipitationOp,
  SetSunStrengthOp,
  SetWetnessOp,
  SetWindOp,
} from "./weather";
import {
  JumpToGoldenHourOp,
  SetAtmosphereOp,
  SetCloudsOp,
  SetHourOp,
  SetLensFlareOp,
  SetShadowsOp,
} from "./time";
import {
  FramePinOp,
  GetCameraStateOp,
  SetApertureOp,
  SetDofOp,
  SetLensOp,
} from "./camera";
import { SetActiveStyleOp, SetAspectRatioOp, SetRenderModeOp } from "./style";
import { SetActivePoseOp, SetDriveModeOp, SetFirstPersonOp } from "./pose";
import { RenderStillOp } from "./viewport";
import { AddPinOp, ClearPinsOp, ListPinsOp, RemovePinOp } from "./annotation";
import { CaptureBookmarkOp, ListBookmarksOp, RestoreBookmarkOp } from "./bookmark";
import { AuditShotOp, DescribeSceneOp, SetSceneCenterOp } from "./scene";

import { useAreaStore } from "@/state/areaStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useStyleStore } from "@/state/styleStore";
import { useWeatherStore } from "@/state/weatherStore";
import { useTimeStore } from "@/state/timeStore";
import { useCameraStore } from "@/state/cameraStore";
import { useRenderModeStore } from "@/state/renderModeStore";
import { useViewportStore } from "@/state/viewportStore";
import { usePoseStore } from "@/state/poseStore";
import { useCarStore } from "@/state/carStore";
import { useBookmarkStore } from "@/state/bookmarkStore";
import { useCinemaStore } from "@/state/cinemaStore";

/**
 * Register every built-in operator into a registry. Mirrors Blender's
 * `ED_operatortypes_*` pattern.
 *
 * Re-runs are safe — call `registry.clear()` first to reset (the HMR
 * boot path does this so freshly added operators land without a
 * full window reload).
 */
export function registerScoutOperators(registry: OperatorRegistry): void {
  // weather
  registry.register(ApplyWeatherPresetOp);
  registry.register(SetWindOp);
  registry.register(SetFogOp);
  registry.register(SetHazeOp);
  registry.register(SetPrecipitationOp);
  registry.register(SetWetnessOp);
  registry.register(SetSunStrengthOp);
  registry.register(SetGodRaysOp);

  // time + atmosphere
  registry.register(SetHourOp);
  registry.register(JumpToGoldenHourOp);
  registry.register(SetAtmosphereOp);
  registry.register(SetCloudsOp);
  registry.register(SetShadowsOp);
  registry.register(SetLensFlareOp);

  // camera
  registry.register(SetLensOp);
  registry.register(SetApertureOp);
  registry.register(SetDofOp);
  registry.register(FramePinOp);
  registry.register(GetCameraStateOp);

  // style / render mode / aspect ratio
  registry.register(SetActiveStyleOp);
  registry.register(SetRenderModeOp);
  registry.register(SetAspectRatioOp);

  // pose / drive
  registry.register(SetActivePoseOp);
  registry.register(SetDriveModeOp);
  registry.register(SetFirstPersonOp);

  // viewport
  registry.register(RenderStillOp);

  // annotation
  registry.register(AddPinOp);
  registry.register(RemovePinOp);
  registry.register(ListPinsOp);
  registry.register(ClearPinsOp);

  // bookmarks
  registry.register(CaptureBookmarkOp);
  registry.register(RestoreBookmarkOp);
  registry.register(ListBookmarksOp);

  // scene
  registry.register(DescribeSceneOp);
  registry.register(AuditShotOp);
  registry.register(SetSceneCenterOp);
}

/**
 * Bind every relevant store to the undo stack so snapshot-based
 * undo captures cross-store state for every undoable operator.
 *
 * Cheaper than per-op deltas and matches Blender's memfile undo at
 * a coarse level — store references are mostly shared between
 * snapshots (Zustand objects are value-stable when nothing changed).
 */
export function bindUndoStores(undo: UndoStack): void {
  bind(undo, "area", useAreaStore);
  bind(undo, "annotation", useAnnotationStore);
  bind(undo, "style", useStyleStore);
  bind(undo, "weather", useWeatherStore);
  bind(undo, "time", useTimeStore);
  bind(undo, "camera", useCameraStore);
  bind(undo, "renderMode", useRenderModeStore);
  bind(undo, "viewport", useViewportStore);
  bind(undo, "pose", usePoseStore);
  bind(undo, "car", useCarStore);
  bind(undo, "bookmark", useBookmarkStore);
  bind(undo, "cinema", useCinemaStore);
}

interface ZustandLikeStore<S> {
  getState: () => S;
  setState: (partial: S | Partial<S> | ((s: S) => S | Partial<S>), replace?: boolean) => void;
}

function bind<S>(undo: UndoStack, id: string, store: ZustandLikeStore<S>): void {
  undo.bind({
    id,
    capture: () => ({ ...store.getState() }),
    // Zustand's `setState(value, true)` replaces wholesale — exactly
    // what we want for restoring a snapshot.
    restore: (snap) => store.setState(snap as S, true),
  });
}

export {
  ApplyWeatherPresetOp,
  SetWindOp,
  SetFogOp,
  SetHazeOp,
  SetPrecipitationOp,
  SetWetnessOp,
  SetSunStrengthOp,
  SetGodRaysOp,
  SetHourOp,
  JumpToGoldenHourOp,
  SetAtmosphereOp,
  SetCloudsOp,
  SetShadowsOp,
  SetLensFlareOp,
  SetLensOp,
  SetApertureOp,
  SetDofOp,
  FramePinOp,
  GetCameraStateOp,
  SetActiveStyleOp,
  SetRenderModeOp,
  SetAspectRatioOp,
  SetActivePoseOp,
  SetDriveModeOp,
  SetFirstPersonOp,
  RenderStillOp,
  AddPinOp,
  RemovePinOp,
  ListPinsOp,
  ClearPinsOp,
  CaptureBookmarkOp,
  RestoreBookmarkOp,
  ListBookmarksOp,
  DescribeSceneOp,
  AuditShotOp,
  SetSceneCenterOp,
};
