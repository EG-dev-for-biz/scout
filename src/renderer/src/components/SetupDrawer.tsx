import React, { useState } from "react";
import { css } from "@emotion/react";
import L from "leaflet";
import {
  Map as MapIcon,
  Settings2,
  AlertTriangle,
  X as XIcon,
} from "lucide-react";
import { MapComponent } from "@/components/map/SelectMap";
import { BuildingHeights } from "@/components/map/Processing";
import { LocationSearch } from "@/components/LocationSearch";
import { TimeControls } from "@/components/TimeControls";
import { WeatherControls } from "@/components/WeatherControls";
import { MoodBookmarks } from "@/components/MoodBookmarks";
import { useAreaStore } from "@/state/areaStore";
import { useProjectStore } from "@/state/projectStore";

// ---------------------------------------------------------------------------
// <SetupDrawer />
// ---------------------------------------------------------------------------
//
// Left edge drawer for the scene-setup workflow: location picking,
// building load, time of day, weather, and mood bookmarks. Defaults
// CLOSED so the viewport stays maximized. A vertical edge tab on the
// left ("SETUP") opens it on click; the panel slides in OVER the
// viewport (does not push it) — same vocabulary as a cinema-camera
// side door that swings out without changing the operator's framing.
//
// Lives as a `position: absolute` overlay inside the main row of App.tsx.

const DRAWER_WIDTH = 340;

interface SetupDrawerProps {
  open: boolean;
  onToggle: () => void;
}

export function SetupDrawer({ open, onToggle }: SetupDrawerProps) {
  const [areaData, setAreaData] = useState<any[]>([]);
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
      {/* Edge tab — visible at the left edge of the viewport regardless of
          open state. Click to toggle. Uses the same matte-body chrome as
          the rest of the camera UI. */}
      <button
        onClick={onToggle}
        title={open ? "Close setup panel" : "Open setup panel"}
        css={css({
          position: "absolute",
          left: 0,
          top: "50%",
          transform: "translateY(-50%)",
          width: "30px",
          height: "120px",
          backgroundColor: "#13131a",
          border: "1px solid #2a2a30",
          borderLeft: "none",
          borderRadius: "0 4px 4px 0",
          padding: "10px 4px",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "6px",
          zIndex: 25,
          color: open ? "#3b82f6" : "#a8a8b0",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.04), 2px 0 8px rgba(0,0,0,0.5)",
          transition: "120ms cubic-bezier(0.4, 0, 0.2, 1)",
          ":hover": {
            backgroundColor: "#1c1c24",
            color: "#e8e8ec",
          },
        })}
      >
        <Settings2 size={13} />
        <span
          css={css({
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontFamily:
              "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
          })}
        >
          Setup
        </span>
      </button>

      {/* Dim backdrop when open — lets the user see the drawer is a
          modal overlay over the viewport, not an inline column. Click
          to close. */}
      {open && (
        <div
          onClick={onToggle}
          css={css({
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(2px)",
            zIndex: 20,
            animation: "fadeIn 200ms ease",
            "@keyframes fadeIn": {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          })}
        />
      )}

      {/* The drawer panel itself */}
      <div
        css={css({
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${DRAWER_WIDTH}px`,
          backgroundColor: "#0f0f11",
          borderRight: "1px solid #2a2a30",
          boxShadow: open ? "8px 0 24px rgba(0,0,0,0.55)" : "none",
          transform: open ? "translateX(0)" : `translateX(-${DRAWER_WIDTH}px)`,
          transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: 22,
        })}
      >
        {/* Drawer header */}
        <div
          css={css({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 14px",
            borderBottom: "1px solid #2a2a30",
            flexShrink: 0,
            background:
              "linear-gradient(to bottom, #18181c 0%, #13131a 100%)",
            boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.03)",
          })}
        >
          <div
            css={css({
              display: "flex",
              alignItems: "center",
              gap: "7px",
              color: "#3b82f6",
            })}
          >
            <MapIcon size={13} />
            <span
              css={css({
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#e8e8ec",
                fontFamily:
                  "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
              })}
            >
              Setup
            </span>
          </div>
          <button
            css={css({
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#6b6b78",
              display: "flex",
              padding: "2px",
              borderRadius: "3px",
              ":hover": { color: "#e8e8ec", backgroundColor: "#1c1c24" },
            })}
            onClick={onToggle}
            title="Close"
          >
            <XIcon size={13} />
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
          {showProcessing && (
            <div
              css={css({
                padding: "14px",
                borderTop: "1px solid #2a2a30",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              })}
            >
              <div>
                <div
                  css={css({
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#e8e8ec",
                    marginBottom: "4px",
                  })}
                >
                  Load Buildings
                </div>
                <div
                  css={css({
                    fontSize: "11px",
                    color: "#6b6b78",
                    marginBottom: "8px",
                  })}
                >
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
                      borderRadius: "4px",
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

        {/* Time / Sun / Weather / Mood controls */}
        <div
          css={css({
            padding: "12px",
            borderTop: "1px solid #2a2a30",
            flex: "0 1 auto",
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            maxHeight: "62%",
          })}
        >
          <TimeControls />
          <WeatherControls />
          <MoodBookmarks />
        </div>
      </div>
    </>
  );
}
