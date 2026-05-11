import React, { useState } from "react";
import { css, keyframes } from "@emotion/react";
import { Brush, Loader2, Eraser, AlertCircle } from "lucide-react";
import { useStyleStore } from "@/state/styleStore";
import { useAreaStore } from "@/state/areaStore";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";
import { useProjectStore } from "@/state/projectStore";
import { paintGround, paintSky } from "@/utils/paintSurfaces";
import { extractBuildingPalette } from "@/utils/colorPalette";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

/**
 * Top-bar button that paints the entire scene's ground in the active style
 * via Gemini's image-edit model. Once painted, the same button toggles to
 * an "Unpaint" / clear action so the user can revert.
 */
export function PaintSceneButton() {
  const style = useStyleStore((s) => s.active);
  const center = useAreaStore((s) => s.center);
  const areas = useAreaStore((s) => s.areas);

  const groundTexture = usePaintedSceneStore((s) => s.groundTexture);
  const skyTexture = usePaintedSceneStore((s) => s.skyTexture);
  const paintingInProgress = usePaintedSceneStore((s) => s.paintingInProgress);
  const paintingMessage = usePaintedSceneStore((s) => s.paintingMessage);
  const paintedStyleId = usePaintedSceneStore((s) => s.paintedStyleId);
  const paintedSkyStyleId = usePaintedSceneStore((s) => s.paintedSkyStyleId);
  const setGroundTexture = usePaintedSceneStore((s) => s.setGroundTexture);
  const setSkyTexture = usePaintedSceneStore((s) => s.setSkyTexture);
  const setDerivedBuildingPalette = usePaintedSceneStore(
    (s) => s.setDerivedBuildingPalette
  );
  const clearBuildingsPaintedViews = usePaintedSceneStore(
    (s) => s.clearBuildingsPaintedViews
  );
  const clearPerBuildingViews = usePaintedSceneStore(
    (s) => s.clearPerBuildingViews
  );
  const setPaintingInProgress = usePaintedSceneStore((s) => s.setPaintingInProgress);
  const markDirty = useProjectStore((s) => s.markDirty);

  const [error, setError] = useState<string | null>(null);

  const sceneReady = areas.length > 0;
  const isPainted = !!groundTexture || !!skyTexture;
  const styleStale =
    isPainted &&
    ((groundTexture && paintedStyleId !== style.id) ||
      (skyTexture && paintedSkyStyleId !== style.id));

  /**
   * Paint Scene: paints ground + sky sequentially. Two API calls, ~8¢ total.
   * Updates `paintingMessage` between phases so the UI can announce progress.
   */
  const handlePaint = async () => {
    if (!sceneReady) return;
    setError(null);

    const a = center[0];
    const b = center[1];
    const bbox = {
      north: Math.max(a.lat, b.lat),
      south: Math.min(a.lat, b.lat),
      east: Math.max(a.lng, b.lng),
      west: Math.min(a.lng, b.lng),
    };

    try {
      // Phase 1: Ground
      setPaintingInProgress(true, `Painting ground as ${style.name}…`);
      const groundResult = await paintGround(bbox, style);
      setGroundTexture(groundResult.imageDataUrl, style.id);

      // Phase 1.5: Auto-tint buildings to harmonize with the painted ground.
      // Tiny CPU pass on the just-painted texture — no extra Gemini call.
      try {
        const palette = await extractBuildingPalette(groundResult.imageDataUrl);
        setDerivedBuildingPalette(palette);
      } catch (paletteErr) {
        console.warn("[PaintScene] palette extraction failed:", paletteErr);
      }

      // Phase 2: Sky
      setPaintingInProgress(true, `Painting sky as ${style.name}…`);
      const skyResult = await paintSky(style);
      setSkyTexture(skyResult.imageDataUrl, style.id);

      markDirty();
    } catch (err) {
      console.error("[PaintScene] failed:", err);
      setError((err as Error).message || "Paint failed");
    } finally {
      setPaintingInProgress(false);
    }
  };

  const handleUnpaint = () => {
    // Full reset — Unpaint should put the scene back to default. Clear
    // ground, sky, derived building palette, AND any projection-textured
    // building views (auto-paint or per-building bake). Otherwise the
    // building meshes keep using their painted shader and the user sees
    // a half-reset scene.
    setGroundTexture(null);
    setSkyTexture(null);
    setDerivedBuildingPalette(null);
    clearBuildingsPaintedViews();
    clearPerBuildingViews();
    setError(null);
    markDirty();
  };

  // Three states: not painted / painted-current-style / painted-stale-style
  let label: string;
  let title: string;
  let icon: React.ReactNode;
  let onClick: () => void;

  if (paintingInProgress) {
    // Show "Ground..." or "Sky..." based on phase if message is set
    label = paintingMessage?.includes("sky")
      ? "Painting sky..."
      : paintingMessage?.includes("ground")
        ? "Painting ground..."
        : "Painting...";
    title = paintingMessage ?? `Asking Gemini to paint scene as ${style.name}`;
    icon = <Loader2 size={11} css={css({ animation: `${spin} 1s linear infinite` })} />;
    onClick = () => {};
  } else if (!isPainted) {
    label = "Paint Scene";
    title = sceneReady
      ? `Paint scene with AI in ${style.name} style`
      : "Load a scene first";
    icon = <Brush size={11} />;
    onClick = handlePaint;
  } else if (styleStale) {
    label = "Repaint";
    title = `Re-paint scene with new active style: ${style.name}`;
    icon = <Brush size={11} />;
    onClick = handlePaint;
  } else {
    label = "Unpaint";
    title = "Revert to satellite imagery";
    icon = <Eraser size={11} />;
    onClick = handleUnpaint;
  }

  const isAccent = !isPainted && sceneReady && !paintingInProgress;

  return (
    <div css={css({ display: "flex", alignItems: "center", gap: "4px", position: "relative" })}>
      <button
        onClick={onClick}
        disabled={!sceneReady || paintingInProgress}
        title={title}
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "5px",
          background: isAccent
            ? "linear-gradient(135deg, #f97316 0%, #ec4899 100%)"
            : isPainted
              ? "#1e1e22"
              : "#15151a",
          border: "1px solid " + (isAccent ? "transparent" : "#2a2a2e"),
          borderRadius: "6px",
          padding: "5px 10px",
          color: isAccent ? "#fff" : sceneReady ? "#e8e8ec" : "#4a4a54",
          fontSize: "11px",
          fontWeight: "600",
          cursor: sceneReady && !paintingInProgress ? "pointer" : "not-allowed",
          transition: "0.15s",
          boxShadow: isAccent ? "0 0 0 0 rgba(249,115,22,0)" : "none",
          ":hover:not(:disabled)": {
            boxShadow: isAccent ? "0 2px 12px rgba(249,115,22,0.5)" : "none",
            backgroundColor: isPainted ? "#2a2a2e" : undefined,
          },
        })}
      >
        {icon}
        {label}
      </button>

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
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
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
