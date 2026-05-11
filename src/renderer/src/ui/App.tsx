import React, { useState, useCallback, useEffect } from "react";
import { css } from "@emotion/react";
import L from "leaflet";
import { Space } from "@/three/Space";
import { ProviderAttribution } from "@/three/SatelliteGround";
import { MapComponent } from "@/components/map/SelectMap";
import { BuildingHeights } from "@/components/map/Processing";
import { AnnotationPanel, AnnotationToggleTab } from "@/components/AnnotationPanel";
import { ProjectToolbar } from "@/components/ProjectToolbar";
import { StyleSelector } from "@/components/StylePanel";
import { RenderModeSelector } from "@/components/RenderModeSelector";
import { CaptureShotButton } from "@/components/CaptureShotButton";
import { LensPicker } from "@/components/LensPicker";
import { PosePicker } from "@/components/PosePicker";
import { RestyleModal } from "@/components/RestyleModal";
import { PaintSceneButton } from "@/components/PaintSceneButton";
import { PaintBuildingsButton } from "@/components/PaintBuildingsButton";
import { PaintFlowOverlay } from "@/components/PaintFlowOverlay";
import { LocationSearch } from "@/components/LocationSearch";
import { TimeControls } from "@/components/TimeControls";
import { ViewportAspectControl } from "@/components/ViewportAspectControl";
import { Modal } from "@/components/modal/Modal";
import { Column } from "@/components/flex/Column";
import { Row } from "@/components/flex/Row";
import { Title } from "@/components/text/Title";
import { Description } from "@/components/text/Description";
import { Button } from "@/components/button/BottomButton";
import { useAreaStore } from "@/state/areaStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useProjectStore } from "@/state/projectStore";
import { useCarStore } from "@/state/carStore";
import { useStyleStore } from "@/state/styleStore";
import { useRenderModeStore } from "@/state/renderModeStore";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";
import { useViewportStore, ratioFor } from "@/state/viewportStore";
import { PinType } from "@/state/annotationStore";
import {
  Map,
  Box,
  Car,
  ChevronLeft,
  ChevronRight,
  MapPin,
  AlertTriangle,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Top navigation bar
// ---------------------------------------------------------------------------

function TopBar({
  leftPanelOpen,
  onToggleLeft,
  annotationPanelOpen,
  onToggleAnnotations,
  onNew,
  onOpenRestyle,
}: {
  leftPanelOpen: boolean;
  onToggleLeft: () => void;
  annotationPanelOpen: boolean;
  onToggleAnnotations: () => void;
  onNew: () => void;
  onOpenRestyle: () => void;
}) {
  const { thirdMode, firstPerson, setThirdMode, setFirstPerson } = useCarStore();
  const areas = useAreaStore((s) => s.areas);

  return (
    <div
      css={css({
        display: "flex",
        alignItems: "center",
        height: "44px",
        backgroundColor: "#17171a",
        borderBottom: "1px solid #2a2a2e",
        paddingLeft: "0",
        flexShrink: 0,
        WebkitAppRegion: "drag" as any,
        userSelect: "none",
      })}
    >
      {/* Drag region spacer for macOS traffic lights */}
      <div css={css({ width: "80px", flexShrink: 0 })} />

      {/* App identity */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "6px",
          paddingRight: "16px",
          borderRight: "1px solid #2a2a2e",
          WebkitAppRegion: "no-drag" as any,
        })}
      >
        <Box size={14} color="#3b82f6" />
        <span css={css({ fontSize: "13px", fontWeight: "700", color: "#e8e8ec" })}>
          Scout3D
        </span>
      </div>

      {/* Project toolbar */}
      <div css={css({ WebkitAppRegion: "no-drag" as any, flex: 1 })}>
        <ProjectToolbar onNew={onNew} />
      </div>

      {/* Right controls */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "6px",
          paddingRight: "12px",
          WebkitAppRegion: "no-drag" as any,
        })}
      >
        {/* Lens picker — choose focal length, drives camera FOV */}
        <LensPicker />

        {/* Capture Shot button */}
        <CaptureShotButton />

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

        {/* Paint Scene — applies AI texture to actual 3D ground */}
        <PaintSceneButton />

        {/* Paint Buildings — projective texturing on buildings from current view */}
        <PaintBuildingsButton />

        <div css={css({ width: "1px", height: "16px", backgroundColor: "#2a2a2e" })} />

        {/* Render mode selector */}
        <RenderModeSelector />

        {/* Style selector dropdown */}
        <StyleSelector />

        <div css={css({ width: "1px", height: "16px", backgroundColor: "#2a2a2e" })} />

        {/* Toggle left panel */}
        <TopBarButton
          onClick={onToggleLeft}
          title={leftPanelOpen ? "Hide Map Panel" : "Show Map Panel"}
          active={leftPanelOpen}
        >
          <Map size={13} />
        </TopBarButton>

        {/* Toggle annotations panel */}
        <TopBarButton
          onClick={onToggleAnnotations}
          title={annotationPanelOpen ? "Hide Annotations" : "Show Annotations"}
          active={annotationPanelOpen}
        >
          <MapPin size={13} />
        </TopBarButton>

        {areas.length > 0 && (
          <>
            <div css={css({ width: "1px", height: "16px", backgroundColor: "#2a2a2e" })} />

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
        gap: "4px",
        backgroundColor: accent
          ? "#3b82f6"
          : active
          ? "#2a2a2e"
          : "transparent",
        border: `1px solid ${active || accent ? "#3a3a3e" : "transparent"}`,
        borderRadius: "6px",
        padding: "4px 8px",
        color: accent ? "#fff" : active ? "#e8e8ec" : "#6b6b78",
        cursor: "pointer",
        transition: "0.15s",
        ":hover": {
          backgroundColor: accent ? "#2563eb" : "#2a2a2e",
          color: "#e8e8ec",
        },
      })}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Left Panel — Map + Processing
// ---------------------------------------------------------------------------

function LeftPanel({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [areaData, setAreaData] = useState<any[]>([]);
  const [warnOpen, setWarnOpen] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  const [flyToBounds, setFlyToBounds] = useState<any>(null);
  const [prefilledBounds, setPrefilledBounds] = useState<any>(null);
  const setCenter = useAreaStore((s) => s.setCenter);
  const markDirty = useProjectStore((s) => s.markDirty);

  const handleDone = (data: any[]) => {
    setAreaData(data);
    setCenter(data);
    setShowProcessing(true);
    markDirty();
  };

  const handleRemove = () => {
    setAreaData([]);
    setShowProcessing(false);
    setFlyToBounds(null);
    setPrefilledBounds(null);
  };

  const handleSearchPick = (
    areaTuple: { lat: number; lng: number }[],
    _result: any
  ) => {
    const ne = areaTuple[0];
    const sw = areaTuple[1];
    const bounds = new L.LatLngBounds([sw.lat, sw.lng], [ne.lat, ne.lng]);

    setFlyToBounds(bounds);
    setPrefilledBounds(bounds);
    setAreaData(areaTuple);
    setCenter(areaTuple);
    setShowProcessing(true);
    markDirty();
  };

  const checkIsBig = () => {
    if (areaData.length < 2) return false;
    const a = Math.abs(areaData[0].lat - areaData[1].lat);
    const b = Math.abs(areaData[0].lng - areaData[1].lng);
    return a + b > 0.1;
  };

  return (
    <>
      <div
        css={css({
          width: isOpen ? "320px" : "0",
          flexShrink: 0,
          transition: "width 0.25s ease",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #2a2a2e",
          backgroundColor: "#17171a",
        })}
      >
        <div
          css={css({
            width: "320px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          })}
        >
          {/* Panel header */}
          <div
            css={css({
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: "1px solid #2a2a2e",
              flexShrink: 0,
            })}
          >
            <div css={css({ display: "flex", alignItems: "center", gap: "6px" })}>
              <Map size={13} color="#3b82f6" />
              <span css={css({ fontSize: "12px", fontWeight: "600", color: "#e8e8ec" })}>
                Location
              </span>
            </div>
            <button
              css={css({
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#6b6b78",
                display: "flex",
                ":hover": { color: "#e8e8ec" },
              })}
              onClick={onToggle}
            >
              <ChevronLeft size={14} />
            </button>
          </div>

          {/* Search bar */}
          <div
            css={css({
              padding: "10px 12px",
              borderBottom: "1px solid #1e1e22",
              flexShrink: 0,
            })}
          >
            <LocationSearch onPick={handleSearchPick} />
          </div>

          {/* Leaflet map */}
          <div css={css({ flex: "0 0 220px", position: "relative" })}>
            <MapComponent
              onDone={handleDone}
              onRemove={handleRemove}
              flyToBounds={flyToBounds}
              prefilledBounds={prefilledBounds}
            />
          </div>

          {/* Scrollable mid-section */}
          <div css={css({ flex: 1, overflowY: "auto", overflowX: "hidden" })}>
            {/* Processing section */}
            {showProcessing && (
              <div
                css={css({
                  padding: "14px",
                  borderTop: "1px solid #2a2a2e",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                })}
              >
                <div>
                  <div css={css({ fontSize: "12px", fontWeight: "600", color: "#e8e8ec", marginBottom: "4px" })}>
                    Load Buildings
                  </div>
                  <div css={css({ fontSize: "11px", color: "#6b6b78", marginBottom: "8px" })}>
                    Fetches OSM building footprints + road network for the selected area.
                  </div>
                  {checkIsBig() && (
                    <div
                      css={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        backgroundColor: "#f59e0b22",
                        border: "1px solid #f59e0b44",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        fontSize: "11px",
                        color: "#f59e0b",
                        marginBottom: "8px",
                      })}
                    >
                      <AlertTriangle size={11} />
                      Large area selected — fetch may be slow.
                    </div>
                  )}
                  <BuildingHeights area={areaData} />
                </div>
              </div>
            )}

            {!showProcessing && (
              <div
                css={css({
                  padding: "20px",
                  color: "#4a4a54",
                  fontSize: "12px",
                  textAlign: "center",
                  lineHeight: "1.6",
                })}
              >
                Draw a box or use the search above to pick a location.
              </div>
            )}
          </div>

          {/* Time / Sun controls — anchored at bottom */}
          <div
            css={css({
              padding: "12px",
              borderTop: "1px solid #2a2a2e",
              flexShrink: 0,
            })}
          >
            <TimeControls />
          </div>
        </div>
      </div>

      {/* Closed-state toggle tab */}
      {!isOpen && (
        <button
          css={css({
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            backgroundColor: "#17171a",
            border: "1px solid #2a2a2e",
            borderLeft: "none",
            borderRadius: "0 6px 6px 0",
            padding: "10px 6px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
            zIndex: 10,
            color: "#a0a0aa",
            ":hover": { color: "#e8e8ec", backgroundColor: "#1e1e22" },
          })}
          onClick={onToggle}
          title="Show Map Panel"
        >
          <ChevronRight size={14} />
        </button>
      )}

      <Modal isOpen={warnOpen} onClose={() => setWarnOpen(false)}>
        <Column gap="0.75rem">
          <Title>Area is large</Title>
          <Description>This may take a while to load. Proceed?</Description>
          <Row gap="0.5rem">
            <Button isShow={true} onClick={() => { setShowProcessing(true); setWarnOpen(false); }}>
              Proceed
            </Button>
            <Button isShow={true} onClick={() => setWarnOpen(false)}>
              Cancel
            </Button>
          </Row>
        </Column>
      </Modal>
    </>
  );
}

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
}: {
  pendingPinType: PinType | null;
  onPinPlaced: () => void;
}) {
  const aspectRatio = useViewportStore((s) => s.aspectRatio);
  const ratio = ratioFor(aspectRatio);

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
        <Space pendingPinType={pendingPinType} onPinPlaced={onPinPlaced} />
        <ProviderAttribution />
        <DriveHUD />
        <PaintFlowOverlay />
        <ViewportAspectControl />

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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

export default function App() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [pendingPinType, setPendingPinType] = useState<PinType | null>(null);
  const [restyleOpen, setRestyleOpen] = useState(false);

  const clearAreas = useAreaStore((s) => s.clearAreas);
  const clearPins = useAnnotationStore((s) => s.clearPins);
  const resetProject = useProjectStore((s) => s.resetProject);
  const setActiveStyle = useStyleStore((s) => s.setActiveById);
  const setRenderMode = useRenderModeStore((s) => s.setMode);
  const clearPaintedScene = usePaintedSceneStore((s) => s.clear);

  // Cancel pending pin on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingPinType(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleNew = useCallback(() => {
    clearAreas();
    clearPins();
    resetProject();
    setActiveStyle("realistic");
    setRenderMode("osm");
    clearPaintedScene();
    setPendingPinType(null);
  }, [clearAreas, clearPins, resetProject, setActiveStyle, setRenderMode, clearPaintedScene]);

  const handleRequestPin = useCallback((type: PinType) => {
    setPendingPinType(type);
    // Open annotations panel so user can see their pins
    setAnnotationOpen(true);
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
      {/* Top bar */}
      <TopBar
        leftPanelOpen={leftOpen}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        annotationPanelOpen={annotationOpen}
        onToggleAnnotations={() => setAnnotationOpen((v) => !v)}
        onNew={handleNew}
        onOpenRestyle={() => setRestyleOpen(true)}
      />

      {/* Main content area */}
      <div
        css={css({
          display: "flex",
          flex: 1,
          overflow: "hidden",
          position: "relative",
        })}
      >
        {/* Left: map panel */}
        <LeftPanel isOpen={leftOpen} onToggle={() => setLeftOpen((v) => !v)} />

        {/* Center: 3D canvas with optional aspect-ratio letterbox */}
        <ViewportFrame
          pendingPinType={pendingPinType}
          onPinPlaced={handlePinPlaced}
        />

        {/* Right: annotation panel */}
        <div css={css({ position: "relative", flexShrink: 0 })}>
          <AnnotationPanel
            isOpen={annotationOpen}
            onToggle={() => setAnnotationOpen((v) => !v)}
            onRequestPin={handleRequestPin}
          />
          {!annotationOpen && (
            <AnnotationToggleTab onClick={() => setAnnotationOpen(true)} />
          )}
        </div>
      </div>

      {/* AI Restyle modal — captures viewport, calls Gemini, shows result */}
      <RestyleModal
        isOpen={restyleOpen}
        onClose={() => setRestyleOpen(false)}
      />
    </div>
  );
}
