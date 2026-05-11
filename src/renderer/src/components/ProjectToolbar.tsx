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

interface ToolbarButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  accent?: boolean;
  danger?: boolean;
}

function ToolbarButton({ onClick, title, children, accent, danger }: ToolbarButtonProps) {
  return (
    <button
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "5px",
        backgroundColor: accent ? "#3b82f6" : danger ? "transparent" : "#1e1e22",
        border: `1px solid ${accent ? "#2563eb" : danger ? "#ef4444" : "#2a2a2e"}`,
        borderRadius: "6px",
        padding: "5px 10px",
        color: accent ? "#fff" : danger ? "#ef4444" : "#a0a0aa",
        fontSize: "11px",
        fontWeight: "500",
        cursor: "pointer",
        transition: "0.15s",
        ":hover": {
          backgroundColor: accent ? "#2563eb" : danger ? "#ef444422" : "#2a2a2e",
          color: accent ? "#fff" : "#e8e8ec",
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
    projectStoreModule.getState().markSaved(result.filePath!);
    projectStoreModule.getState().setProjectName(project.name);
  };

  const handleSave = async () => {
    if (!window.api) return;
    const content = serializeProject(
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
      buildingsPaintedViews
    );

    if (projectPath) {
      const result = await window.api.dialog.saveFile(projectPath, content);
      if (result.success) markSaved(projectPath);
    } else {
      await handleSaveAs();
    }
  };

  const handleSaveAs = async () => {
    if (!window.api) return;
    const content = serializeProject(
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
      buildingsPaintedViews
    );
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
      {/* Project name + dirty indicator */}
      <div
        css={css({
          fontSize: "12px",
          color: isDirty ? "#f59e0b" : "#6b6b78",
          marginRight: "4px",
          fontWeight: "500",
          maxWidth: "160px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        })}
        title={projectPath || "Unsaved project"}
      >
        {isDirty ? "●  " : ""}
        {projectName}
      </div>

      <div css={css({ width: "1px", height: "16px", backgroundColor: "#2a2a2e" })} />

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

      <div css={css({ width: "1px", height: "16px", backgroundColor: "#2a2a2e" })} />

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
