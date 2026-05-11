import { AnnotationPin } from "@/state/annotationStore";
import { RenderMode } from "@/state/renderModeStore";
import { WeatherSnapshot } from "@/state/weatherStore";
import { MoodSnapshot } from "@/state/bookmarkStore";

export interface PaintedBuildingsView {
  imageDataUrl: string;
  viewProjMatrix: number[];
  cameraPos: [number, number, number];
  styleId: string;
}

/**
 * Version history:
 *   1.0 — initial.
 *   1.1 — adds styleId.
 *   1.2 — adds sceneDate + solarLightingEnabled.
 *   1.3 — adds renderMode.
 *   1.4 — adds painted ground texture + paintedStyleId.
 *   1.5 — adds painted sky panorama.
 *   1.6 — single painted buildings view (legacy).
 *   1.7 — multi-view painted buildings.
 *   1.8 — adds weather snapshot + mood bookmark slots.
 */
const CURRENT_VERSION = "1.8" as const;
const KNOWN_VERSIONS = ["1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8"] as const;

export interface ScoutProject {
  version: typeof CURRENT_VERSION | string;
  name: string;
  savedAt: string;
  center: { lat: number; lng: number }[];
  areas: any[];
  pins: AnnotationPin[];
  /** ID of the active StyleProfile preset (added in v1.1). */
  styleId?: string;
  /** Scene time-of-day ISO string + solar lighting flag (added in v1.2). */
  sceneDate?: string;
  solarLightingEnabled?: boolean;
  /** Render mode (added in v1.3). */
  renderMode?: RenderMode;
  /** AI-painted ground texture as data URL + the style it was painted in (v1.4). */
  paintedGroundTexture?: string;
  paintedStyleId?: string;
  /** AI-painted sky panorama (v1.5). */
  paintedSkyTexture?: string;
  paintedSkyStyleId?: string;
  /**
   * AI-painted buildings projective views + camera matrices (v1.7).
   * Up to 4 entries, each from a different camera angle. Older format
   * (singular `paintedBuildingsView`) is migrated to the first entry.
   */
  paintedBuildingsViews?: PaintedBuildingsView[];
  /** Legacy single-view field (v1.6) — auto-migrated on load. */
  paintedBuildingsView?: PaintedBuildingsView;
  /** Weather snapshot — wind, fog, haze, godRays, precipitation, wetness (v1.8). */
  weather?: WeatherSnapshot;
  /** Mood bookmark slots (length 3, null entries allowed) (v1.8). */
  moodBookmarks?: (MoodSnapshot | null)[];
}

export function serializeProject(
  name: string,
  center: { lat: number; lng: number }[],
  areas: any[],
  pins: AnnotationPin[],
  styleId?: string,
  sceneDate?: Date,
  solarLightingEnabled?: boolean,
  renderMode?: RenderMode,
  paintedGroundTexture?: string | null,
  paintedStyleId?: string | null,
  paintedSkyTexture?: string | null,
  paintedSkyStyleId?: string | null,
  paintedBuildingsViews?: PaintedBuildingsView[] | null,
  weather?: WeatherSnapshot | null,
  moodBookmarks?: (MoodSnapshot | null)[] | null
): string {
  const project: ScoutProject = {
    version: CURRENT_VERSION,
    name,
    savedAt: new Date().toISOString(),
    center,
    areas,
    pins,
    styleId,
    sceneDate: sceneDate?.toISOString(),
    solarLightingEnabled,
    renderMode,
    paintedGroundTexture: paintedGroundTexture ?? undefined,
    paintedStyleId: paintedStyleId ?? undefined,
    paintedSkyTexture: paintedSkyTexture ?? undefined,
    paintedSkyStyleId: paintedSkyStyleId ?? undefined,
    paintedBuildingsViews:
      paintedBuildingsViews && paintedBuildingsViews.length > 0
        ? paintedBuildingsViews
        : undefined,
    weather: weather ?? undefined,
    moodBookmarks:
      moodBookmarks && moodBookmarks.some((s) => s != null)
        ? moodBookmarks
        : undefined,
  };
  return JSON.stringify(project, null, 2);
}

export function deserializeProject(content: string): ScoutProject | null {
  try {
    const parsed = JSON.parse(content);
    // Be permissive about versions: log a warning if it's unknown but
    // accept it anyway. The fields are all additive across versions so a
    // newer client can read an older file losslessly, and older clients
    // can read a newer file by ignoring unknown fields.
    if (typeof parsed.version === "string") {
      if (!KNOWN_VERSIONS.includes(parsed.version)) {
        console.warn(
          `[projectFile] Unknown project version: ${parsed.version} (current is ${CURRENT_VERSION}); attempting load anyway.`
        );
      }
    } else {
      console.warn("[projectFile] Project file is missing a version field.");
    }
    return parsed as ScoutProject;
  } catch (error) {
    console.error("Failed to parse project file:", error);
    return null;
  }
}
