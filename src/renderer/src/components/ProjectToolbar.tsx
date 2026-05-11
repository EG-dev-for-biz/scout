import React from "react";
import { css } from "@emotion/react";
import { FolderOpen, Save, FilePlus, Download, Upload, ClipboardList } from "lucide-react";
import { useProjectStore } from "@/state/projectStore";
import { useAreaStore } from "@/state/areaStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useStyleStore } from "@/state/styleStore";
import { useTimeStore } from "@/state/timeStore";
import { useRenderModeStore } from "@/state/renderModeStore";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";
import { useWeatherStore, DEFAULT_WEATHER } from "@/state/weatherStore";
import { useBookmarkStore } from "@/state/bookmarkStore";
import { useGeneratedObjectStore } from "@/state/generatedObjectStore";
import { serializeProject, deserializeProject } from "@/utils/projectFile";
import { useActionStore } from "@/state/exportStore";

// Zustand store refs for imperative access during file open
const areaStoreModule = useAreaStore;
const annotationStoreModule = useAnnotationStore;
const projectStoreModule = useProjectStore;
const styleStoreModule = useStyleStore;
const timeStoreModule = useTimeStore;
const renderModeStoreModule = useRenderModeStore;
const paintedSceneStoreModule = usePaintedSceneStore;
const weatherStoreModule = useWeatherStore;
const bookmarkStoreModule = useBookmarkStore;
const generatedObjectStoreModule = useGeneratedObjectStore;

interface ToolbarButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  accent?: boolean;
  danger?: boolean;
}

// Camera-body chrome shared across the top toolbar. Cine-camera buttons
// are matte-black with a faint top-edge highlight and a bottom-edge
// shadow to read as physically convex; pressing them snaps into an
// inset shadow as if the button just clicked into the body. The
// uppercase, slightly-spaced monospace label is the visual cue that
// borrows the most from real camera HUDs (Arri Alexa OLED, RED touch,
// DJI Ronin). Accent (amber) = save / dirty-state callout; danger =
// destructive (red border, transparent fill until hover).
function ToolbarButton({ onClick, title, children, accent, danger }: ToolbarButtonProps) {
  return (
    <button
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "5px",
        backgroundColor: accent ? "#3a2a14" : danger ? "transparent" : "#13131a",
        border: `1px solid ${accent ? "#c89048" : danger ? "#7a2828" : "#2a2a30"}`,
        borderRadius: "4px",
        padding: "5px 9px",
        color: accent ? "#ffb968" : danger ? "#ef4444" : "#a8a8b0",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        fontFamily:
          "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
        cursor: "pointer",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.6)",
        transition: "120ms cubic-bezier(0.4, 0, 0.2, 1)",
        ":hover": {
          backgroundColor: accent ? "#4a3418" : danger ? "#3a1414" : "#1c1c24",
          borderColor: accent ? "#e0a050" : danger ? "#ef4444" : "#3a3a44",
          color: accent ? "#ffd098" : danger ? "#ff6464" : "#e8e8ec",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 0 rgba(0,0,0,0.6)",
        },
        ":active": {
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
          backgroundColor: accent ? "#2a1c08" : danger ? "#2a0c0c" : "#0e0e14",
        },
      })}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

interface ProjectToolbarProps {
  onNew: () => void;
}

export function ProjectToolbar({ onNew }: ProjectToolbarProps) {
  const { projectPath, projectName, isDirty, markSaved } = useProjectStore();
  const { areas, center } = useAreaStore();
  const { pins } = useAnnotationStore();
  const { activeId } = useStyleStore();
  const sceneDate = useTimeStore((s) => s.date);
  const solarLightingEnabled = useTimeStore((s) => s.solarLightingEnabled);
  const renderMode = useRenderModeStore((s) => s.mode);
  const paintedGroundTexture = usePaintedSceneStore((s) => s.groundTexture);
  const paintedStyleId = usePaintedSceneStore((s) => s.paintedStyleId);
  const paintedSkyTexture = usePaintedSceneStore((s) => s.skyTexture);
  const paintedSkyStyleId = usePaintedSceneStore((s) => s.paintedSkyStyleId);
  const buildingsPaintedViews = usePaintedSceneStore((s) => s.buildingsPaintedViews);
  // NOTE: Don't subscribe to a derived `weather` object via zustand's
  // selector — returning a new object literal would bust reference
  // equality and cause an infinite re-render loop. Snapshot lazily inside
  // the save handlers via `useXxx.getState()` instead. The save handlers
  // run on click; staleness is impossible.
  const { triggerGlbExport, triggerAnnotationsExport, triggerShotListExport } = useActionStore();

  const handleNew = () => {
    if (isDirty) {
      if (!confirm("You have unsaved changes. Start a new project anyway?")) return;
    }
    onNew();
  };

  const handleOpen = async () => {
    if (!window.api) return;
    if (isDirty) {
      if (!confirm("You have unsaved changes. Open another project?")) return;
    }
    const result = await window.api.dialog.openFile();
    if (result.canceled || !result.content) return;

    const project = deserializeProject(result.content);
    if (!project) {
      alert("Failed to load project file.");
      return;
    }

    // Hydrate stores imperatively
    areaStoreModule.getState().setCenter(project.center);
    areaStoreModule.getState().appendAreas(project.areas);
    annotationStoreModule.getState().setPins(project.pins || []);
    if (project.styleId) styleStoreModule.getState().setActiveById(project.styleId);
    if (project.sceneDate) timeStoreModule.getState().setDate(new Date(project.sceneDate));
    if (typeof project.solarLightingEnabled === "boolean") {
      timeStoreModule.getState().setSolarLightingEnabled(project.solarLightingEnabled);
    }
    if (project.renderMode) renderModeStoreModule.getState().setMode(project.renderMode);
    paintedSceneStoreModule.getState().clear();
    if (project.paintedGroundTexture) {
      paintedSceneStoreModule
        .getState()
        .setGroundTexture(project.paintedGroundTexture, project.paintedStyleId ?? null);
    }
    if (project.paintedSkyTexture) {
      paintedSceneStoreModule
        .getState()
        .setSkyTexture(project.paintedSkyTexture, project.paintedSkyStyleId ?? null);
    }
    // Migrate v1.6 single field → v1.7 array if needed
    const buildingsViews =
      project.paintedBuildingsViews ??
      (project.paintedBuildingsView ? [project.paintedBuildingsView] : []);
    if (buildingsViews.length > 0) {
      paintedSceneStoreModule.getState().setBuildingsPaintedViews(buildingsViews);
    }
    // v1.8 — weather + mood bookmarks. Both are optional; absent fields
    // reset to defaults so an older project loads with a clean weather
    // panel rather than residual state from the previous project.
    weatherStoreModule.getState().setAll(project.weather ?? DEFAULT_WEATHER);
    bookmarkStoreModule.getState().setSlots(project.moodBookmarks ?? [null, null, null]);
    // v1.9 — restore generated 3D props. We adopt the file's projectId if
    // one is stored so the scout3d-asset:// URLs continue to resolve to
    // the same on-disk folder; otherwise the renderer's freshly-minted
    // id is kept (mostly a non-issue for pre-v1.9 projects that have no
    // generatedObjects yet).
    if (project.projectId) {
      projectStoreModule.getState().setProjectId(project.projectId);
    }
    generatedObjectStoreModule
      .getState()
      .setObjects(project.generatedObjects ?? []);
    projectStoreModule.getState().markSaved(result.filePath!);
    projectStoreModule.getState().setProjectName(project.name);
  };

  const buildWeatherSnapshot = () => {
    const w = weatherStoreModule.getState();
    return {
      wind: w.wind,
      fog: w.fog,
      haze: w.haze,
      godRays: w.godRays,
      precipitation: w.precipitation,
      wetness: w.wetness,
      autoLinkWetness: w.autoLinkWetness,
    };
  };

  const buildSerializedProject = () =>
    serializeProject(
      projectName,
      center,
      areas,
      pins,
      activeId,
      sceneDate,
      solarLightingEnabled,
      renderMode,
      paintedGroundTexture,
      paintedStyleId,
      paintedSkyTexture,
      paintedSkyStyleId,
      buildingsPaintedViews,
      buildWeatherSnapshot(),
      bookmarkStoreModule.getState().slots,
      projectStoreModule.getState().projectId,
      generatedObjectStoreModule.getState().objects
    );

  const handleSave = async () => {
    if (!window.api) return;
    const content = buildSerializedProject();

    if (projectPath) {
      const result = await window.api.dialog.saveFile(projectPath, content);
      if (result.success) markSaved(projectPath);
    } else {
      await handleSaveAs();
    }
  };

  const handleSaveAs = async () => {
    if (!window.api) return;
    const content = buildSerializedProject();
    const result = await window.api.dialog.saveFileAs(content);
    if (!result.canceled && result.filePath) {
      markSaved(result.filePath);
    }
  };

  return (
    <div
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "0 8px",
      })}
    >
      {/* Project name slate. Reads like an LCD readout on the camera
          body — small uppercase letters with a pulsing red "rec dot"
          when there are unsaved changes. */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginRight: "4px",
          maxWidth: "180px",
          padding: "3px 8px",
          backgroundColor: "#0a0a0e",
          border: "1px solid #1e1e22",
          borderRadius: "3px",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
        })}
        title={projectPath || "Unsaved project"}
      >
        <span
          css={css({
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: isDirty ? "#ef4444" : "#22c55e",
            boxShadow: isDirty
              ? "0 0 6px rgba(239,68,68,0.7)"
              : "0 0 4px rgba(34,197,94,0.4)",
            flexShrink: 0,
            animation: isDirty ? "pulse 1.4s ease-in-out infinite" : "none",
            "@keyframes pulse": {
              "0%, 100%": { opacity: 1 },
              "50%": { opacity: 0.45 },
            },
          })}
        />
        <span
          css={css({
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: isDirty ? "#ffb968" : "#a8a8b0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "-apple-system, 'SF Mono', Menlo, monospace",
          })}
        >
          {projectName}
        </span>
      </div>

      <Divider />

      <ToolbarButton onClick={handleNew} title="New project">
        <FilePlus size={12} /> New
      </ToolbarButton>

      <ToolbarButton onClick={handleOpen} title="Open project">
        <FolderOpen size={12} /> Open
      </ToolbarButton>

      <ToolbarButton
        onClick={handleSave}
        title={projectPath ? `Save (${projectPath})` : "Save As..."}
        accent={isDirty}
      >
        <Save size={12} /> {projectPath ? "Save" : "Save As"}
      </ToolbarButton>

      {projectPath && (
        <ToolbarButton onClick={handleSaveAs} title="Save As...">
          Save As
        </ToolbarButton>
      )}

      <Divider />

      <ToolbarButton onClick={() => triggerGlbExport()} title="Export scene as GLB">
        <Download size={12} /> GLB
      </ToolbarButton>

      <ToolbarButton onClick={() => triggerAnnotationsExport()} title="Export annotations as JSON">
        <Upload size={12} /> Pins JSON
      </ToolbarButton>

      <ToolbarButton
        onClick={() => triggerShotListExport()}
        title="Export shot list as Markdown"
      >
        <ClipboardList size={12} /> Shot List
      </ToolbarButton>
    </div>
  );
}

// Faint vertical separator between toolbar button groups — mimics the
// engraved divider lines on a cine camera body that visually cluster
// related controls (record / playback / menu).
function Divider() {
  return (
    <div
      css={css({
        width: "1px",
        height: "18px",
        background:
          "linear-gradient(to bottom, transparent, #2a2a30 30%, #2a2a30 70%, transparent)",
        margin: "0 2px",
      })}
    />
  );
}
