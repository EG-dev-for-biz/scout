import { useEffect, useMemo, useState } from "react";
import { css } from "@emotion/react";
import {
  Sun,
  Moon,
  Wind,
  CloudRain,
  CloudSnow,
  Cloud,
  Aperture,
  Compass,
  MapPin,
  Clock,
  Crosshair,
} from "lucide-react";
import { useAreaStore } from "@/state/areaStore";
import { useTimeStore } from "@/state/timeStore";
import {
  useCameraStore,
  fovToFocalLength,
} from "@/state/cameraStore";
import {
  useWeatherStore,
  compassFromBearing,
  type Precipitation,
} from "@/state/weatherStore";
import {
  getSolarPosition,
  isDaytime,
} from "@/utils/solarPosition";

// ---------------------------------------------------------------------------
// <ViewportHUD />
// ---------------------------------------------------------------------------
//
// Bottom strip rendered over the 3D viewport — the operator's HUD on a
// cinema camera or DJI controller. Reads at a glance:
//
//   TC ────  SCENE 16:06 / 05·11·26    [pulsing colon]
//   LOC ───  40.7831N  73.9712W
//   SUN ───  9° W  (sunrise icon when up, moon when down)
//   LENS ──  35mm  f/2.8
//   FOCUS ─  47.3m  (only when DoF + focusTarget set)
//   WIND ──  12 m/s NW
//   WX ────  RAIN 50%   (kind + intensity; CLEAR when none)
//
// Every group has a tiny uppercase label + a monospace value, mirroring
// the HUD vocabulary you'd see on Arri Alexa OLED, RED touch panels, or
// the DJI Ronin display. Sections are joined by faint gradient dividers
// so the strip reads as a single readout, not a row of buttons.

const HUD_HEIGHT = 28;

export function ViewportHUD() {
  const center = useAreaStore((s) => s.center);
  const date = useTimeStore((s) => s.date);
  const cameraSnapshot = useCameraStore((s) => s.current);
  const apertureF = useCameraStore((s) => s.apertureF);
  const dofEnabled = useCameraStore((s) => s.dofEnabled);
  const focusTarget = useCameraStore((s) => s.focusTarget);
  const wind = useWeatherStore((s) => s.wind);
  const precipitation = useWeatherStore((s) => s.precipitation);

  // Wall-clock seconds for a blinking-colon timecode effect. We don't
  // need React state for the colon itself (CSS animation handles it) but
  // we DO want a 1-second tick so the readout's "ticking" feel is
  // honest — useful in projects with live mode on.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const refLat = (center[0].lat + center[1].lat) / 2;
  const refLng = (center[0].lng + center[1].lng) / 2;

  const sun = useMemo(
    () => getSolarPosition(date, refLat, refLng),
    [date, refLat, refLng]
  );
  const dayMode = useMemo(
    () => isDaytime(date, refLat, refLng),
    [date, refLat, refLng]
  );

  const focalMM = cameraSnapshot
    ? Math.round(fovToFocalLength(cameraSnapshot.fov))
    : null;

  // Live focus distance in meters (only when a target is set + DoF on).
  let focusDistanceM: number | null = null;
  if (focusTarget && cameraSnapshot && dofEnabled) {
    const dx = cameraSnapshot.position[0] - focusTarget[0];
    const dy = cameraSnapshot.position[1] - focusTarget[1];
    const dz = cameraSnapshot.position[2] - focusTarget[2];
    focusDistanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ----- formatters ------------------------------------------------------

  const sceneTime = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const sceneDate = date
    .toLocaleDateString([], { year: "2-digit", month: "2-digit", day: "2-digit" })
    .replace(/\//g, "·");

  const lat = formatLatLng(refLat, "lat");
  const lng = formatLatLng(refLng, "lng");

  const sunAltDeg = Math.round((sun.altitude * 180) / Math.PI);
  const sunCompass = compassFromBearing((sun.azimuth * 180) / Math.PI);
  const fStopLabel =
    apertureF % 1 === 0 ? apertureF.toFixed(0) : apertureF.toFixed(1);

  return (
    <div
      css={css({
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: `${HUD_HEIGHT}px`,
        display: "flex",
        alignItems: "center",
        gap: 0,
        // Matte body panel with a top-edge highlight + recessed inner
        // shadow — reads as the bottom plate of the camera body.
        background:
          "linear-gradient(to bottom, #0e0e14 0%, #0a0a0e 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 4px 8px rgba(0,0,0,0.35)",
        borderTop: "1px solid #0a0a0e",
        color: "#a8a8b0",
        fontSize: "10px",
        fontFamily: "'SF Mono', Menlo, Consolas, monospace",
        letterSpacing: "0.03em",
        userSelect: "none",
        pointerEvents: "none",
        zIndex: 10,
      })}
    >
      {/* TC — scene time, blinking colon. */}
      <HudGroup
        icon={<Clock size={10} color="#7da6e8" />}
        label="TC"
        flex
      >
        <span
          css={css({
            color: "#e8e8ec",
            fontWeight: 700,
            letterSpacing: "0.04em",
          })}
        >
          {sceneTime.replace(":", "")}
          {/* Blinking colon overlay so the value reads as a "live"
              tick rather than a static label. */}
          <span
            css={css({
              position: "absolute",
              marginLeft: "-13px",
              marginTop: "-1px",
              animation: "tcBlink 1s steps(2, end) infinite",
              "@keyframes tcBlink": {
                "0%, 50%": { opacity: 1 },
                "50.01%, 100%": { opacity: 0 },
              },
            })}
          >
            :
          </span>
        </span>
        <span css={css({ color: "#4a4a54" })}>·</span>
        <span css={css({ color: "#7a7a86" })}>{sceneDate}</span>
        {/* tick is just used to force a re-render once per second so
            relative-time-like readouts stay fresh; rendering it as a
            zero-width span keeps it free. */}
        <span css={css({ display: "none" })}>{tick}</span>
      </HudGroup>

      <HudDivider />

      {/* LOC — scene-center lat/lng */}
      <HudGroup icon={<MapPin size={10} color="#7da6e8" />} label="LOC">
        <span css={css({ color: "#e8e8ec" })}>{lat}</span>
        <span css={css({ color: "#4a4a54" })}>·</span>
        <span css={css({ color: "#e8e8ec" })}>{lng}</span>
      </HudGroup>

      <HudDivider />

      {/* SUN — altitude + azimuth compass */}
      <HudGroup
        icon={
          dayMode ? (
            <Sun size={10} color="#fbbf24" />
          ) : (
            <Moon size={10} color="#7da6e8" />
          )
        }
        label="SUN"
      >
        <span
          css={css({
            color: dayMode ? "#fbbf24" : "#7da6e8",
            fontWeight: 700,
          })}
        >
          {sunAltDeg > 0 ? `+${sunAltDeg}` : sunAltDeg}°
        </span>
        <span css={css({ color: "#7a7a86" })}>{sunCompass}</span>
      </HudGroup>

      <HudDivider />

      {/* LENS — focal length + (if DoF on) f-stop */}
      <HudGroup icon={<Aperture size={10} color="#3b82f6" />} label="LENS">
        <span
          css={css({
            color: "#e8e8ec",
            fontWeight: 700,
            fontSize: "11px",
          })}
        >
          {focalMM != null ? `${focalMM}` : "—"}
        </span>
        <span css={css({ color: "#7a7a86", fontSize: "9px" })}>mm</span>
        {dofEnabled && (
          <>
            <span css={css({ color: "#4a4a54" })}>·</span>
            <span css={css({ color: "#d97757", fontWeight: 600 })}>
              f/{fStopLabel}
            </span>
          </>
        )}
      </HudGroup>

      {/* FOCUS — only shown when DoF is on and a target is set */}
      {focusDistanceM != null && (
        <>
          <HudDivider />
          <HudGroup
            icon={<Crosshair size={10} color="#d97757" />}
            label="FOCUS"
          >
            <span css={css({ color: "#e8e8ec", fontWeight: 700 })}>
              {focusDistanceM > 1000
                ? `${(focusDistanceM / 1000).toFixed(1)}km`
                : `${focusDistanceM.toFixed(1)}m`}
            </span>
          </HudGroup>
        </>
      )}

      {/* Flex spacer pushes the weather block to the right. */}
      <div css={css({ flex: 1 })} />

      {/* WIND */}
      <HudGroup icon={<Wind size={10} color="#7da6e8" />} label="WIND">
        <span css={css({ color: "#e8e8ec", fontWeight: 700 })}>
          {wind.speed.toFixed(0)}
        </span>
        <span css={css({ color: "#7a7a86", fontSize: "9px" })}>m/s</span>
        <span css={css({ color: "#7a7a86" })}>
          {compassFromBearing(wind.direction)}
        </span>
      </HudGroup>

      <HudDivider />

      {/* WX — weather summary */}
      <HudGroup icon={iconForPrecip(precipitation.kind)} label="WX">
        <span css={css({ color: "#e8e8ec", fontWeight: 700 })}>
          {labelForPrecip(precipitation.kind)}
        </span>
        {precipitation.kind !== "none" && (
          <span css={css({ color: "#7a7a86" })}>
            {Math.round(precipitation.intensity * 100)}%
          </span>
        )}
      </HudGroup>

      <div css={css({ width: "12px" })} />

      {/* Compass strip at the far right — reinforces orientation without
          words. Spins to match wind direction so the user has a quick
          visual cue. */}
      <Compass
        size={14}
        color="#3a3a44"
        css={css({
          marginRight: "8px",
          transform: `rotate(${wind.direction}deg)`,
          transition: "transform 400ms ease",
        })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HudGroup({
  icon,
  label,
  children,
  flex,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  flex?: boolean;
}) {
  return (
    <div
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "0 10px",
        position: "relative",
        // Small fixed min-width so values don't make groups jitter
        // when they fluctuate by one character.
        minWidth: flex ? "auto" : 0,
      })}
    >
      <span css={css({ display: "flex" })}>{icon}</span>
      <span
        css={css({
          fontSize: "8.5px",
          fontWeight: 700,
          letterSpacing: "0.12em",
          color: "#4a4a54",
        })}
      >
        {label}
      </span>
      <span
        css={css({
          display: "flex",
          alignItems: "baseline",
          gap: "3px",
          paddingLeft: "2px",
        })}
      >
        {children}
      </span>
    </div>
  );
}

function HudDivider() {
  return (
    <div
      css={css({
        width: "1px",
        height: "14px",
        background:
          "linear-gradient(to bottom, transparent, #2a2a30 30%, #2a2a30 70%, transparent)",
        flexShrink: 0,
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLatLng(value: number, kind: "lat" | "lng"): string {
  const abs = Math.abs(value);
  const deg = abs.toFixed(4);
  const hemi =
    kind === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${deg}°${hemi}`;
}

function iconForPrecip(kind: Precipitation): React.ReactNode {
  switch (kind) {
    case "drizzle":
    case "rain":
    case "heavy":
      return <CloudRain size={10} color="#7da6e8" />;
    case "snow":
    case "snowstorm":
      return <CloudSnow size={10} color="#cbd5e1" />;
    case "none":
    default:
      return <Cloud size={10} color="#6b6b78" />;
  }
}

function labelForPrecip(kind: Precipitation): string {
  switch (kind) {
    case "none":
      return "CLEAR";
    case "drizzle":
      return "DRIZZLE";
    case "rain":
      return "RAIN";
    case "heavy":
      return "HEAVY";
    case "snow":
      return "SNOW";
    case "snowstorm":
      return "STORM";
  }
}
