import React, { useState, useCallback, useEffect, useRef } from "react";
import { css } from "@emotion/react";
import { Space } from "@/three/Space";
import { ProviderAttribution } from "@/three/SatelliteGround";
import { ProjectToolbar } from "@/components/ProjectToolbar";
import { StyleSelector } from "@/components/StylePanel";
import { RenderModeSelector } from "@/components/RenderModeSelector";
import { PosePicker } from "@/components/PosePicker";
import { RestyleModal } from "@/components/RestyleModal";
import { GenerateObjectModal } from "@/components/GenerateObjectModal";
import { PaintSceneButton } from "@/components/PaintSceneButton";
import { PaintBuildingsButton } from "@/components/PaintBuildingsButton";
import { PaintFlowOverlay } from "@/components/PaintFlowOverlay";
import { ViewportAspectControl } from "@/components/ViewportAspectControl";
import { GeneratedObjectToolbar } from "@/components/GeneratedObjectToolbar";
import { ViewportHUD } from "@/components/ViewportHUD";
import { LensDial } from "@/components/LensDial";
import { ShutterButton } from "@/components/ShutterButton";
import { SlateBurn } from "@/components/SlateBurn";
import { Filmstrip } from "@/components/Filmstrip";
import { ExposureMeter } from "@/components/ExposureMeter";
import { FocusPickReticle } from "@/components/FocusReticle";
import { SetupDrawer } from "@/components/SetupDrawer";
import { ShotNotesDrawer } from "@/components/ShotNotesDrawer";
import { useAreaStore } from "@/state/areaStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useProjectStore } from "@/state/projectStore";
import { useCarStore } from "@/state/carStore";
import { useStyleStore } from "@/state/styleStore";
import { useRenderModeStore } from "@/state/renderModeStore";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";
import { useViewportStore, ratioFor } from "@/state/viewportStore";
import { useWeatherStore, DEFAULT_WEATHER } from "@/state/weatherStore";
import { useBookmarkStore } from "@/state/bookmarkStore";
import { useGeneratedObjectStore } from "@/state/generatedObjectStore";
import { useCameraStore } from "@/state/cameraStore";
import { useShutter } from "@/utils/useShutter";
import { PinType } from "@/state/annotationStore";
import {
  Box,
  Car,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Top navigation bar
// ---------------------------------------------------------------------------

function TopBar({
  onNew,
  onOpenRestyle,
  onOpenGenerateObject,
}: {
  onNew: () => void;
  onOpenRestyle: () => void;
  onOpenGenerateObject: () => void;
}) {
  const { thirdMode, firstPerson, setThirdMode, setFirstPerson } = useCarStore();
  const areas = useAreaStore((s) => s.areas);

  return (
    <div
      css={css({
        display: "flex",
        alignItems: "center",
        height: "44px",
        // Matte camera body — subtle vertical gradient (lighter at top,
        // a hair darker at bottom) reads as a slightly bevelled metal
        // surface. The bottom border is double-stacked: a faint inner
        // highlight then the harder edge line, mimicking the way a real
        // chassis seam catches light.
        background:
          "linear-gradient(to bottom, #18181c 0%, #131318 100%)",
        borderBottom: "1px solid #0a0a0e",
        boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.03)",
        paddingLeft: "0",
        flexShrink: 0,
        WebkitAppRegion: "drag" as any,
        userSelect: "none",
      })}
    >
      {/* Drag region spacer for macOS traffic lights */}
      <div css={css({ width: "80px", flexShrink: 0 })} />

      {/* App identity — reads like the brand badge etched into a cine
          camera's side plate. Uppercase + extra letter-spacing matches
          the rest of the HUD vocabulary. */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "7px",
          paddingRight: "16px",
          borderRight: "1px solid #0a0a0e",
          boxShadow: "1px 0 0 rgba(255,255,255,0.03)",
          WebkitAppRegion: "no-drag" as any,
        })}
      >
        <Box size={14} color="#3b82f6" />
        <span
          css={css({
            fontSize: "11px",
            fontWeight: 700,
            color: "#e8e8ec",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily:
              "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
          })}
        >
          Scout3D
        </span>
      </div>

      {/* Project toolbar */}
      <div css={css({ WebkitAppRegion: "no-drag" as any, flex: 1 })}>
        <ProjectToolbar onNew={onNew} />
      </div>

      {/* Right controls — kept minimal in the camera-body vocabulary.
          Lens, capture, focus picker, and panels all live IN the
          viewport now (LensDial, ShutterButton, drawers, FocusReticle).
          Top bar holds project chrome, AI tools, render mode, and the
          mannequin / drive shortcuts. */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "6px",
          paddingRight: "12px",
          WebkitAppRegion: "no-drag" as any,
        })}
      >
        {/* AI Restyle (single image preview) */}
        <button
          onClick={onOpenRestyle}
          title="AI Restyle the current view (preview only)"
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
            border: "none",
            borderRadius: "6px",
            padding: "5px 10px",
            color: "#fff",
            fontSize: "11px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "0.15s",
            boxShadow: "0 0 0 0 rgba(168,85,247,0.0)",
            ":hover": {
              boxShadow: "0 2px 12px rgba(168,85,247,0.5)",
            },
          })}
        >
          <Sparkles size={11} />
          AI Restyle
        </button>

        {/* Generate 3D Prop (local SF3D, places into scene) */}
        <button
          onClick={onOpenGenerateObject}
          title="Generate a 3D prop from the current view or an image (local)"
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: "linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)",
            border: "none",
            borderRadius: "6px",
            padding: "5px 10px",
            color: "#fff",
            fontSize: "11px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "0.15s",
            boxShadow: "0 0 0 0 rgba(34,211,238,0.0)",
            ":hover": {
              boxShadow: "0 2px 12px rgba(34,211,238,0.5)",
            },
          })}
        >
          <Box size={11} />
          Generate Prop
        </button>

        {/* Paint Scene — applies AI texture to actual 3D ground */}
        <PaintSceneButton />

        {/* Paint Buildings — projective texturing on buildings from current view */}
        <PaintBuildingsButton />

        <TopBarDivider />

        {/* Render mode selector */}
        <RenderModeSelector />

        {/* Style selector dropdown */}
        <StyleSelector />

        {areas.length > 0 && (
          <>
            <TopBarDivider />

            {/* Mannequin pose picker (disabled while in drive mode) */}
            <PosePicker />

            {/* Car mode */}
            <TopBarButton
              onClick={() => {
                setThirdMode(!thirdMode);
                if (thirdMode) setFirstPerson(false);
              }}
              title={thirdMode ? "Exit Drive Mode (ESC)" : "Enter Drive Mode"}
              active={thirdMode}
              accent={thirdMode}
            >
              <Car size={13} />
              <span css={css({ fontSize: "11px" })}>
                {thirdMode ? "Driving" : "Drive"}
              </span>
            </TopBarButton>

            {thirdMode && (
              <TopBarButton
                onClick={() => setFirstPerson(!firstPerson)}
                title={firstPerson ? "Third-Person Camera (V)" : "First-Person Camera (V)"}
                active={firstPerson}
              >
                {firstPerson ? <Eye size={13} /> : <EyeOff size={13} />}
                <span css={css({ fontSize: "11px" })}>{firstPerson ? "1st" : "3rd"}</span>
              </TopBarButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Cine-camera body button. Same matte-black-with-bevel chrome as the
// ProjectToolbar buttons, with an extra "active LED" affordance — when
// a control is toggled on (e.g. drive mode, annotations open), a small
// cyan dot lights up before the icon. Accent (red) gets a glow halo
// for record-style emphasis.
function TopBarButton({
  onClick,
  title,
  active,
  accent,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "5px",
        position: "relative",
        backgroundColor: accent
          ? "#3a1a1a"
          : active
            ? "#1c1c24"
            : "#13131a",
        border: `1px solid ${
          accent ? "#a83838" : active ? "#3a3a44" : "#2a2a30"
        }`,
        borderRadius: "4px",
        padding: "4px 8px",
        color: accent ? "#ff7a7a" : active ? "#e8e8ec" : "#a8a8b0",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        fontFamily:
          "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
        cursor: "pointer",
        boxShadow: accent
          ? "inset 0 1px 0 rgba(255,180,180,0.08), 0 0 8px rgba(220,38,38,0.35), 0 1px 0 rgba(0,0,0,0.6)"
          : "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.6)",
        transition: "120ms cubic-bezier(0.4, 0, 0.2, 1)",
        ":hover": {
          backgroundColor: accent
            ? "#4a1c1c"
            : active
              ? "#24242c"
              : "#1c1c24",
          borderColor: accent ? "#cc4848" : "#3a3a44",
          color: accent ? "#ff9898" : "#e8e8ec",
        },
        ":active": {
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
          backgroundColor: accent ? "#2a0e0e" : "#0e0e14",
        },
      })}
    >
      {/* Active LED — small cyan dot when toggled on. Appears
          before any children so the user reads "[•] LABEL" left-to-right. */}
      {active && !accent && (
        <span
          css={css({
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            backgroundColor: "#3b82f6",
            boxShadow: "0 0 5px rgba(59,130,246,0.7)",
            flexShrink: 0,
          })}
        />
      )}
      {children}
    </button>
  );
}

// Faint vertical separator between top-bar button groups. Same gradient
// idiom as ProjectToolbar's Divider — visually clusters related camera
// controls (eg. "shot" group vs "view" group) without a hard line.
function TopBarDivider() {
  return (
    <div
      css={css({
        width: "1px",
        height: "20px",
        background:
          "linear-gradient(to bottom, transparent, #2a2a30 25%, #2a2a30 75%, transparent)",
        margin: "0 3px",
      })}
    />
  );
}

// LeftPanel removed — replaced by <SetupDrawer> in components/. The drawer
// is an absolute overlay over the viewport instead of a flex-pushing column,
// matching the Director's Viewfinder layout: maximize the viewport and
// surface scene-setup controls as a side panel that swings out on demand.

// ---------------------------------------------------------------------------
// Drive-mode HUD overlay
// ---------------------------------------------------------------------------

function DriveHUD() {
  const thirdMode = useCarStore((s) => s.thirdMode);
  const firstPerson = useCarStore((s) => s.firstPerson);
  if (!thirdMode) return null;

  return (
    <div
      css={css({
        position: "absolute",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#17171af0",
        backdropFilter: "blur(8px)",
        border: "1px solid #2a2a2e",
        borderRadius: "10px",
        padding: "8px 16px",
        display: "flex",
        gap: "16px",
        alignItems: "center",
        zIndex: 50,
        color: "#a0a0aa",
        fontSize: "11px",
        pointerEvents: "none",
      })}
    >
      <span><kbd css={kbdStyle}>W A S D</kbd> Move</span>
      <span><kbd css={kbdStyle}>Mouse</kbd> Steer</span>
      <span><kbd css={kbdStyle}>F</kbd> Drop Shot Pin</span>
      <span><kbd css={kbdStyle}>V</kbd> {firstPerson ? "3rd Person" : "1st Person"}</span>
      <span><kbd css={kbdStyle}>ESC</kbd> Exit</span>
    </div>
  );
}

const kbdStyle = css({
  backgroundColor: "#2a2a2e",
  border: "1px solid #3a3a3e",
  borderRadius: "4px",
  padding: "1px 5px",
  fontSize: "10px",
  color: "#e8e8ec",
  fontFamily: "monospace",
});

// ---------------------------------------------------------------------------
// Viewport frame — letterboxes the 3D canvas to the selected aspect ratio
// ---------------------------------------------------------------------------

function ViewportFrame({
  pendingPinType,
  onPinPlaced,
  setupOpen,
  shotsOpen,
  onToggleSetup,
  onToggleShots,
  onRequestPin,
}: {
  pendingPinType: PinType | null;
  onPinPlaced: () => void;
  setupOpen: boolean;
  shotsOpen: boolean;
  onToggleSetup: () => void;
  onToggleShots: () => void;
  onRequestPin: (type: PinType) => void;
}) {
  const aspectRatio = useViewportStore((s) => s.aspectRatio);
  const ratio = ratioFor(aspectRatio);
  const innerFrameRef = useRef<HTMLDivElement | null>(null);

  // When constrained, the inner frame is sized via CSS aspect-ratio:
  // width tries 100%; if that would exceed container height, max-height clamps
  // it and the browser back-computes width to preserve the ratio. Modern
  // Chromium (Electron 35 ships Chrome 134+) handles this correctly.
  const innerStyle =
    ratio == null
      ? css({ width: "100%", height: "100%" })
      : css({
          aspectRatio: `${ratio}`,
          width: "100%",
          maxHeight: "100%",
          // When max-height clamps, the browser recomputes width from height.
          // The `margin: auto` in the parent flex centers regardless.
        });

  return (
    <div
      css={css({
        flex: 1,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Letterbox/pillarbox surround. Slightly darker than the panels so
        // the framed shot reads as the foreground.
        backgroundColor: "#0a0a0c",
      })}
    >
      <div
        ref={innerFrameRef}
        css={[
          css({
            position: "relative",
            overflow: "hidden",
            backgroundColor: "#0f0f11",
            // Subtle separator from the letterbox area when constrained.
            boxShadow:
              ratio == null
                ? "none"
                : "0 0 0 1px #1e1e22, 0 10px 40px rgba(0,0,0,0.4)",
          }),
          innerStyle,
        ]}
      >
        {/* The 3D scene itself. */}
        <Space pendingPinType={pendingPinType} onPinPlaced={onPinPlaced} />

        {/* Pre-existing overlays. */}
        <ProviderAttribution />
        <DriveHUD />
        <PaintFlowOverlay />
        <ViewportAspectControl />
        <GeneratedObjectToolbar />
        <ViewportHUD />

        {/* Cinema-camera affordances. Each is `position: absolute`
            relative to this inner frame. Order matters for click
            targets; higher in the tree = lower z. */}
        <LensDial />
        <ExposureMeter />
        <FocusPickReticle containerRef={innerFrameRef} />
        <Filmstrip />
        <ShutterButton />
        <SlateBurn />

        {/* Edge drawers slide in OVER the viewport. They're absolute
            positioned relative to this same frame so they letterbox
            cleanly with the chosen aspect ratio. */}
        <SetupDrawer open={setupOpen} onToggle={onToggleSetup} />
        <ShotNotesDrawer
          open={shotsOpen}
          onToggle={onToggleShots}
          onRequestPin={onRequestPin}
          onAutoOpen={onToggleShots}
        />

        {/* Pending pin instruction overlay */}
        {pendingPinType && (
          <div
            css={css({
              position: "absolute",
              top: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "#17171af0",
              backdropFilter: "blur(8px)",
              border: "1px dashed #3b82f688",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "12px",
              color: "#a0a0aa",
              pointerEvents: "none",
              zIndex: 50,
            })}
          >
            Click in the scene to place a{" "}
            <strong style={{ color: "#3b82f6" }}>
              {pendingPinType.charAt(0).toUpperCase() + pendingPinType.slice(1)}
            </strong>{" "}
            pin &nbsp;·&nbsp; <kbd css={kbdStyle}>ESC</kbd> to cancel
          </div>
        )}

        {/* Pending generated-object placement overlay */}
        <PendingObjectOverlay />
      </div>
    </div>
  );
}

function PendingObjectOverlay() {
  const pendingGlbUrl = useGeneratedObjectStore((s) => s.pendingGlbUrl);
  if (!pendingGlbUrl) return null;
  return (
    <div
      css={css({
        position: "absolute",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#17171af0",
        backdropFilter: "blur(8px)",
        border: "1px dashed #22d3ee88",
        borderRadius: "8px",
        padding: "8px 16px",
        fontSize: "12px",
        color: "#a0a0aa",
        pointerEvents: "none",
        zIndex: 50,
      })}
    >
      Click anywhere in the scene to place your{" "}
      <strong style={{ color: "#22d3ee" }}>generated prop</strong>{" "}
      &nbsp;·&nbsp; <kbd css={kbdStyle}>ESC</kbd> to cancel
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

export default function App() {
  // Drawers start CLOSED — the cinema-camera Director's Viewfinder
  // posture is "viewport first, panels second." User pulls the edge
  // tabs when they need them; auto-open events (pin select, etc.) only
  // bring them up at the right moment.
  const [setupOpen, setSetupOpen] = useState(false);
  const [shotsOpen, setShotsOpen] = useState(false);
  const [pendingPinType, setPendingPinType] = useState<PinType | null>(null);
  const [restyleOpen, setRestyleOpen] = useState(false);
  const [generateObjectOpen, setGenerateObjectOpen] = useState(false);

  const clearAreas = useAreaStore((s) => s.clearAreas);
  const clearPins = useAnnotationStore((s) => s.clearPins);
  const resetProject = useProjectStore((s) => s.resetProject);
  const setActiveStyle = useStyleStore((s) => s.setActiveById);
  const setRenderMode = useRenderModeStore((s) => s.setMode);
  const clearPaintedScene = usePaintedSceneStore((s) => s.clear);
  const resetWeather = useWeatherStore((s) => s.setAll);
  const resetBookmarks = useBookmarkStore((s) => s.setSlots);

  // The shutter hook — shared by the ShutterButton inside the viewport
  // AND by the SPACE keyboard binding here.
  const fireShutter = useShutter();
  const pins = useAnnotationStore((s) => s.pins);
  const selectedPinId = useAnnotationStore((s) => s.selectedPinId);
  const selectPin = useAnnotationStore((s) => s.selectPin);
  const requestFraming = useCameraStore((s) => s.requestFraming);
  const setThirdMode = useCarStore((s) => s.setThirdMode);

  // Global keyboard. Implements:
  //   - Escape       cancel pin placement, close any open drawer
  //   - Space        fire shutter (when not typing in an input)
  //   - [ / ]        step through filmstrip shots
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore keystrokes targeted at input fields — the user is typing,
      // not driving the camera HUD.
      const target = e.target as HTMLElement;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        setPendingPinType(null);
        useGeneratedObjectStore.getState().setPending(null);
        useGeneratedObjectStore.getState().selectObject(null);
        setSetupOpen(false);
        setShotsOpen(false);
        return;
      }

      if (isInput) return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        fireShutter();
        return;
      }

      // [ / ] navigate filmstrip — find current selected shot's index
      // and step. Falls back to first / last if nothing selected.
      if (e.key === "[" || e.key === "]") {
        const shots = pins.filter((p) => p.type === "shot");
        if (shots.length === 0) return;
        let idx = shots.findIndex((p) => p.id === selectedPinId);
        if (idx === -1) idx = e.key === "[" ? 0 : shots.length - 1;
        else idx = e.key === "[" ? Math.max(0, idx - 1) : Math.min(shots.length - 1, idx + 1);
        const pin = shots[idx];
        if (pin?.camera) {
          setThirdMode(false);
          requestFraming(pin.camera);
          selectPin(pin.id);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    fireShutter,
    pins,
    selectedPinId,
    selectPin,
    requestFraming,
    setThirdMode,
  ]);

  const handleNew = useCallback(() => {
    clearAreas();
    clearPins();
    resetProject();
    setActiveStyle("realistic");
    setRenderMode("osm");
    clearPaintedScene();
    resetWeather(DEFAULT_WEATHER);
    resetBookmarks([null, null, null]);
    setPendingPinType(null);
    useGeneratedObjectStore.getState().clearObjects();
  }, [
    clearAreas,
    clearPins,
    resetProject,
    setActiveStyle,
    setRenderMode,
    clearPaintedScene,
    resetWeather,
    resetBookmarks,
  ]);

  const handleRequestPin = useCallback((type: PinType) => {
    setPendingPinType(type);
    // Pin placement implies the user wants to see the resulting pin in
    // the shot-notes drawer.
    setShotsOpen(true);
  }, []);

  const handlePinPlaced = useCallback(() => {
    setPendingPinType(null);
  }, []);

  return (
    <div
      css={css({
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "#0f0f11",
      })}
    >
      {/* Top bar — slim, project + render mode + AI tools + drive only.
          Lens, shutter, drawers all live inside the viewport. */}
      <TopBar
        onNew={handleNew}
        onOpenRestyle={() => setRestyleOpen(true)}
        onOpenGenerateObject={() => setGenerateObjectOpen(true)}
      />

      {/* Main content area — single viewport, no flex columns. Drawers
          are absolute overlays managed inside ViewportFrame. */}
      <div
        css={css({
          display: "flex",
          flex: 1,
          overflow: "hidden",
          position: "relative",
        })}
      >
        <ViewportFrame
          pendingPinType={pendingPinType}
          onPinPlaced={handlePinPlaced}
          setupOpen={setupOpen}
          shotsOpen={shotsOpen}
          onToggleSetup={() => setSetupOpen((v) => !v)}
          onToggleShots={() => setShotsOpen((v) => !v)}
          onRequestPin={handleRequestPin}
        />
      </div>

      {/* AI Restyle modal — captures viewport, calls Gemini, shows result */}
      <RestyleModal
        isOpen={restyleOpen}
        onClose={() => setRestyleOpen(false)}
      />

      {/* Generate 3D Prop modal — captures viewport / file, runs SF3D
          locally via the main-process Python bridge, sets pendingGlbUrl
          so the next scene click drops the prop in world space. */}
      <GenerateObjectModal
        isOpen={generateObjectOpen}
        onClose={() => setGenerateObjectOpen(false)}
      />
    </div>
  );
}
