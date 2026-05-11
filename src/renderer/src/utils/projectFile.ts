import { AnnotationPin } from "@/state/annotationStore";
import { RenderMode } from "@/state/renderModeStore";

export interface PaintedBuildingsView {
  imageDataUrl: string;
  viewProjMatrix: number[];
  cameraPos: [number, number, number];
  styleId: string;
}

export interface ScoutProject {
  version: "1.7";
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
  paintedBuildingsViews?: PaintedBuildingsView[] | null
): string {
  const project: ScoutProject = {
    version: "1.7",
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
  };
  return JSON.stringify(project, null, 2);
}

export function deserializeProject(content: string): ScoutProject | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.version !== "1.0") {
      console.warn("Unknown project version:", parsed.version);
    }
    return parsed as ScoutProject;
  } catch (error) {
    console.error("Failed to parse project file:", error);
    return null;
  }
}
