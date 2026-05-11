import React, { useState } from "react";
import { css, keyframes } from "@emotion/react";
import {
  Building2,
  Loader2,
  AlertCircle,
  Eraser,
  Sparkles,
  Plus,
} from "lucide-react";
import * as THREE from "three";
import { useStyleStore } from "@/state/styleStore";
import { useAreaStore } from "@/state/areaStore";
import { useCameraStore } from "@/state/cameraStore";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";
import { useProjectStore } from "@/state/projectStore";
import { usePaintFlowStore } from "@/state/paintFlowStore";
import { paintBuildings } from "@/utils/paintBuildings";
import { autoPaintBuildings } from "@/utils/autoPaintBuildings";
import { paintPerBuilding } from "@/utils/paintPerBuilding";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const MAX_VIEWS = 4;

/**
 * Two paths to painted buildings:
 *
 *   1. PRIMARY: Auto-Paint — runs autoPaintBuildings() which programmatically
 *      tweens through 4 vantages of the photoreal source, then paints all in
 *      parallel via Gemini. ~25s, 4 API calls. The good one.
 *
 *   2. SECONDARY: +1 View — captures the current camera framing and adds it
 *      to the existing array as a single paint pass. Power-user mode for
 *      when you want a specific hero angle.
 *
 *   3. ERASER — clears all painted views.
 */
export function PaintBuildingsButton() {
  const style = useStyleStore((s) => s.active);
  const areas = useAreaStore((s) => s.areas);

  const views = usePaintedSceneStore((s) => s.buildingsPaintedViews);
  const perBuildingViews = usePaintedSceneStore((s) => s.perBuildingViews);
  const perBuildingCount = Object.keys(perBuildingViews).length;
  const addBuildingsPaintedView = usePaintedSceneStore(
    (s) => s.addBuildingsPaintedView
  );
  const clearBuildingsPaintedViews = usePaintedSceneStore(
    (s) => s.clearBuildingsPaintedViews
  );
  const clearPerBuildingViews = usePaintedSceneStore(
    (s) => s.clearPerBuildingViews
  );

  const flowBusy = usePaintFlowStore((s) => s.busy);
  const flowMessage = usePaintFlowStore((s) => s.message);
  const flowProgress = usePaintFlowStore((s) => s.progress);

  const markDirty = useProjectStore((s) => s.markDirty);

  const [error, setError] = useState<string | null>(null);
  const [singlePaintBusy, setSinglePaintBusy] = useState(false);

  const sceneReady = areas.length > 0;
  const viewCount = views.length;
  const busy = flowBusy || singlePaintBusy;

  // ── Auto-Paint (primary) ────────────────────────────────────────────────

  const handleAutoPaint = async () => {
    if (!sceneReady) return;
    setError(null);
    try {
      await autoPaintBuildings(style);
      markDirty();
    } catch (err) {
      setError((err as Error).message || "Auto-paint failed");
    }
  };

  // ── Single-view paint (secondary) ──────────────────────────────────────

  const handleSinglePaint = async () => {
    if (!sceneReady) return;
    setError(null);

    const snap = useCameraStore.getState().current;
    if (!snap) {
      setError("Orbit the scene once before painting");
      return;
    }

    const canvas = document.querySelector("canvas");
    const aspect =
      canvas && canvas.width > 0 ? canvas.width / canvas.height : 16 / 9;
    const camera = new THREE.PerspectiveCamera(snap.fov, aspect, 0.1, 7000);
    camera.position.set(...snap.position);
    camera.lookAt(...snap.target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    setSinglePaintBusy(true);
    try {
      const result = await paintBuildings(camera, style);
      addBuildingsPaintedView({
        imageDataUrl: result.imageDataUrl,
        viewProjMatrix: result.viewProjMatrix,
        cameraPos: result.cameraPos,
        styleId: style.id,
      });
      markDirty();
    } catch (err) {
      console.error("[PaintBuildings] failed:", err);
      setError((err as Error).message || "Paint failed");
    } finally {
      setSinglePaintBusy(false);
    }
  };

  const handleClear = () => {
    clearBuildingsPaintedViews();
    clearPerBuildingViews();
    setError(null);
    markDirty();
  };

  // ── Per-building bake — moves camera per-building, captures from
  //    photoreal mesh perpendicular to each facade ─────────────────────
  const handlePerBuildingBake = async () => {
    if (!sceneReady) return;
    setError(null);
    try {
      await paintPerBuilding(style);
      markDirty();
    } catch (err) {
      setError((err as Error).message || "Per-building bake failed");
    }
  };

  // ── Primary button label/state ─────────────────────────────────────────

  let primaryLabel: string;
  let primaryIcon: React.ReactNode;
  let primaryTitle: string;

  if (flowBusy) {
    primaryLabel =
      flowProgress.captured < flowProgress.total
        ? `Capturing ${flowProgress.captured + 1}/${flowProgress.total}…`
        : `Painting ${flowProgress.painted}/${flowProgress.total}…`;
    primaryTitle = flowMessage || "Auto-painting buildings";
    primaryIcon = <Loader2 size={11} css={css({ animation: `${spin} 1s linear infinite` })} />;
  } else if (viewCount === 0) {
    primaryLabel = "Auto-Paint Buildings";
    primaryTitle = sceneReady
      ? `Capture 4 photoreal views and paint with Gemini in ${style.name} style`
      : "Load a scene first";
    primaryIcon = <Sparkles size={11} />;
  } else {
    primaryLabel = "Re-Auto-Paint";
    primaryTitle = `Repaint with new captures (clears existing ${viewCount} views)`;
    primaryIcon = <Sparkles size={11} />;
  }

  const isAccent = sceneReady && !busy;

  return (
    <div
      css={css({ display: "flex", alignItems: "center", gap: "4px", position: "relative" })}
    >
      {/* PRIMARY — Auto-Paint */}
      <button
        onClick={handleAutoPaint}
        disabled={!sceneReady || busy}
        title={primaryTitle}
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "5px",
          background: isAccent
            ? "linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)"
            : "#15151a",
          border: "1px solid " + (isAccent ? "transparent" : "#2a2a2e"),
          borderRadius: "6px",
          padding: "5px 10px",
          color: isAccent ? "#fff" : sceneReady ? "#e8e8ec" : "#4a4a54",
          fontSize: "11px",
          fontWeight: "600",
          cursor: sceneReady && !busy ? "pointer" : "not-allowed",
          transition: "0.15s",
          ":hover:not(:disabled)": {
            boxShadow: isAccent ? "0 2px 12px rgba(6,182,212,0.5)" : "none",
          },
        })}
      >
        {primaryIcon}
        {primaryLabel}
      </button>

      {/* SECONDARY — +1 View (manual single-camera paint) */}
      <button
        onClick={handleSinglePaint}
        disabled={!sceneReady || busy}
        title={
          sceneReady
            ? `Add a single paint pass from the current camera angle (${viewCount}/${MAX_VIEWS} stored)`
            : "Load a scene first"
        }
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "3px",
          backgroundColor: "#1e1e22",
          border: "1px solid #2a2a2e",
          borderRadius: "6px",
          padding: "5px 8px",
          color: sceneReady && !busy ? "#a0a0aa" : "#4a4a54",
          fontSize: "10px",
          fontWeight: "500",
          cursor: sceneReady && !busy ? "pointer" : "not-allowed",
          transition: "0.15s",
          ":hover:not(:disabled)": {
            backgroundColor: "#2a2a2e",
            color: "#e8e8ec",
          },
        })}
      >
        {singlePaintBusy ? (
          <Loader2 size={10} css={css({ animation: `${spin} 1s linear infinite` })} />
        ) : (
          <>
            <Plus size={10} />
            <Building2 size={10} />
          </>
        )}
        {viewCount > 0 ? `${viewCount}/${MAX_VIEWS}` : "1"}
      </button>

      {/* TERTIARY — Per-Building Bake (independent — works without auto-paint) */}
      <button
        onClick={handlePerBuildingBake}
        disabled={!sceneReady || busy}
        title={
          sceneReady
            ? `Bake top 15 visible buildings individually. Camera flies to each building, captures from photoreal mesh perpendicular to its facade, then Gemini stylizes per building. ${
                perBuildingCount > 0
                  ? `${perBuildingCount} buildings already baked.`
                  : ""
              }`
            : "Load a scene first"
        }
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "4px",
            background:
              perBuildingCount > 0
                ? "#2a1f3a"
                : sceneReady && !busy
                  ? "linear-gradient(135deg, #f97316 0%, #ec4899 100%)"
                  : "#15151a",
            border:
              perBuildingCount > 0
                ? "1px solid #a855f7"
                : "1px solid transparent",
            borderRadius: "6px",
            padding: "5px 9px",
            color: sceneReady && !busy ? "#fff" : "#4a4a54",
            fontSize: "10px",
            fontWeight: "600",
            cursor: sceneReady && !busy ? "pointer" : "not-allowed",
            transition: "0.15s",
            ":hover:not(:disabled)": {
              boxShadow: "0 2px 12px rgba(249,115,22,0.5)",
            },
          })}
        >
        {perBuildingCount > 0 ? "Re-Bake Each" : "Bake Each Building"}
        {perBuildingCount > 0 && (
          <span css={css({ color: "#c4b5fd", fontFamily: "monospace" })}>
            {perBuildingCount}
          </span>
        )}
      </button>

      {/* ERASER */}
      {viewCount > 0 && !busy && (
        <button
          onClick={handleClear}
          title="Clear all painted building views"
          css={css({
            display: "flex",
            alignItems: "center",
            backgroundColor: "transparent",
            border: "1px solid #2a2a2e",
            borderRadius: "6px",
            padding: "5px 6px",
            color: "#6b6b78",
            cursor: "pointer",
            transition: "0.15s",
            ":hover": { color: "#ef4444", borderColor: "#ef4444" },
          })}
        >
          <Eraser size={11} />
        </button>
      )}

      {error && (
        <div
          css={css({
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            backgroundColor: "#2a1414",
            border: "1px solid #ef4444",
            borderRadius: "6px",
            padding: "5px 8px",
            fontSize: "10px",
            color: "#fca5a5",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            maxWidth: "320px",
            zIndex: 100,
          })}
          onClick={() => setError(null)}
        >
          <AlertCircle size={10} /> {error}
        </div>
      )}
    </div>
  );
}
