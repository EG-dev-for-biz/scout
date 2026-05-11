import React from "react";
import { css } from "@emotion/react";
import {
  Wind,
  CloudFog,
  Sun,
  Sunrise,
  CloudRain,
  Droplets,
  CloudSnow,
  Cloud,
  Zap,
} from "lucide-react";
import {
  useWeatherStore,
  compassFromBearing,
  WEATHER_PRESETS,
  type WeatherPresetId,
  type Precipitation,
} from "@/state/weatherStore";

// ---------------------------------------------------------------------------
// <WeatherControls />
// ---------------------------------------------------------------------------
//
// Standalone panel sibling to TimeControls. Owns the new tier-1 atmospheric
// inputs: wind, ground fog, haze/pollution, god rays, precipitation,
// surface wetness, plus a preset chip row at the top.
//
// Mounted in the left panel below TimeControls in App.tsx. Visual styling
// mirrors TimeControls (same colors, SubToggle/PresetBtn idioms) so the
// two panels read as one continuous form.

export function WeatherControls() {
  const wind = useWeatherStore((s) => s.wind);
  const fog = useWeatherStore((s) => s.fog);
  const haze = useWeatherStore((s) => s.haze);
  const godRays = useWeatherStore((s) => s.godRays);
  const precipitation = useWeatherStore((s) => s.precipitation);
  const wetness = useWeatherStore((s) => s.wetness);
  const autoLinkWetness = useWeatherStore((s) => s.autoLinkWetness);
  const sunStrength = useWeatherStore((s) => s.sunStrength);

  const setWindDirection = useWeatherStore((s) => s.setWindDirection);
  const setWindSpeed = useWeatherStore((s) => s.setWindSpeed);
  const setFog = useWeatherStore((s) => s.setFog);
  const setHaze = useWeatherStore((s) => s.setHaze);
  const setGodRays = useWeatherStore((s) => s.setGodRays);
  const setPrecipitation = useWeatherStore((s) => s.setPrecipitation);
  const setWetness = useWeatherStore((s) => s.setWetness);
  const setAutoLinkWetness = useWeatherStore((s) => s.setAutoLinkWetness);
  const setSunStrength = useWeatherStore((s) => s.setSunStrength);
  const applyPreset = useWeatherStore((s) => s.applyPreset);

  return (
    <div
      css={css({
        backgroundColor: "#0f0f11",
        border: "1px solid #2a2a2e",
        borderRadius: "8px",
        padding: "10px 12px",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      })}
    >
      {/* Header */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "6px",
        })}
      >
        <Cloud size={13} color="#7da6e8" />
        <span css={css({ fontSize: "12px", fontWeight: "600", color: "#e8e8ec" })}>
          Weather
        </span>
      </div>

      {/* Preset chips */}
      <div
        css={css({
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
        })}
      >
        {WEATHER_PRESETS.map((p) => (
          <PresetChip
            key={p.id}
            label={p.label}
            title={p.description}
            onClick={() => applyPreset(p.id as WeatherPresetId)}
          />
        ))}
      </div>

      <Divider />

      {/* Sun strength — boosts the directional sun + ambient fill so
          building facades read brighter. 1.0 = physical baseline; 0..1
          dims; 1..3 progressively over-illuminates. Mirrored across the
          atmospheric and legacy lighting paths. */}
      <Section
        icon={<Sunrise size={11} color="#fbbf24" />}
        label="Sun strength"
      >
        <LabeledSlider
          label="Multiplier"
          value={sunStrength}
          min={0}
          max={3}
          step={0.05}
          formatValue={(v) => `${v.toFixed(2)}×`}
          onChange={setSunStrength}
        />
        <Hint>
          Boosts the directional sun and ambient fill. 1× is the physical
          baseline; crank up to brighten facades, drop below for moodier
          scenes.
        </Hint>
      </Section>

      <Divider />

      {/* Wind */}
      <Section icon={<Wind size={11} color="#7da6e8" />} label="Wind">
        <CompassDial
          direction={wind.direction}
          onChange={setWindDirection}
        />
        <LabeledSlider
          label="Speed"
          value={wind.speed}
          min={0}
          max={30}
          step={0.5}
          formatValue={(v) => `${v.toFixed(1)} m/s`}
          onChange={setWindSpeed}
        />
        <Hint>
          {`${wind.speed.toFixed(0)} m/s ${compassFromBearing(wind.direction)}`}
          {" — drives clouds, fog drift, rain slant, precipitation."}
        </Hint>
      </Section>

      <Divider />

      {/* Ground fog */}
      <Section
        icon={<CloudFog size={11} color="#a0a0aa" />}
        label="Ground fog"
        toggle={{
          checked: fog.enabled,
          onChange: (v) => setFog({ enabled: v }),
        }}
      >
        {fog.enabled && (
          <>
            <LabeledSlider
              label="Density"
              value={fog.density}
              min={0}
              max={1}
              step={0.01}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => setFog({ density: v })}
            />
            <LabeledSlider
              label="Top height"
              value={fog.heightTop}
              min={5}
              max={300}
              step={1}
              formatValue={(v) => `${v.toFixed(0)} m`}
              onChange={(v) => setFog({ heightTop: v })}
            />
            <LabeledSlider
              label="Falloff"
              value={fog.heightFalloff}
              min={2}
              max={120}
              step={1}
              formatValue={(v) => `${v.toFixed(0)} m`}
              onChange={(v) => setFog({ heightFalloff: v })}
            />
            <ColorRow
              label="Tint"
              value={fog.color}
              onChange={(c) => setFog({ color: c })}
            />
          </>
        )}
      </Section>

      <Divider />

      {/* Haze / pollution */}
      <Section
        icon={<Sun size={11} color="#fbbf24" />}
        label="Haze / pollution"
        toggle={{
          checked: haze.enabled,
          onChange: (v) => setHaze({ enabled: v }),
        }}
      >
        {haze.enabled && (
          <>
            <LabeledSlider
              label="Amount"
              value={haze.amount}
              min={0}
              max={2}
              step={0.05}
              formatValue={(v) => v.toFixed(2)}
              onChange={(v) => setHaze({ amount: v })}
            />
            <ColorRow
              label="Tint"
              value={haze.tint}
              onChange={(c) => setHaze({ tint: c })}
            />
            <Hint>Sun-coupled atmospheric haze. Higher tint warmth = wildfire / sunset feel.</Hint>
          </>
        )}
      </Section>

      <Divider />

      {/* God rays */}
      <Section
        icon={<Zap size={11} color="#fbbf24" />}
        label="God rays"
        toggle={{
          checked: godRays.enabled,
          onChange: (v) => setGodRays({ enabled: v }),
        }}
      >
        {godRays.enabled && (
          <>
            <LabeledSlider
              label="Density"
              value={godRays.density}
              min={0.85}
              max={0.98}
              step={0.005}
              formatValue={(v) => v.toFixed(3)}
              onChange={(v) => setGodRays({ density: v })}
            />
            <LabeledSlider
              label="Decay"
              value={godRays.decay}
              min={0.85}
              max={0.99}
              step={0.005}
              formatValue={(v) => v.toFixed(3)}
              onChange={(v) => setGodRays({ decay: v })}
            />
            <LabeledSlider
              label="Exposure"
              value={godRays.exposure}
              min={0}
              max={0.6}
              step={0.01}
              formatValue={(v) => v.toFixed(2)}
              onChange={(v) => setGodRays({ exposure: v })}
            />
            <Hint>
              Auto-disabled when sun is below horizon. Exposure above ~0.4
              starts washing the frame into a radial smear.
            </Hint>
          </>
        )}
      </Section>

      <Divider />

      {/* Precipitation */}
      <Section
        icon={<CloudRain size={11} color="#7da6e8" />}
        label="Precipitation"
      >
        <PrecipKindRow
          value={precipitation.kind}
          onChange={(kind) => setPrecipitation({ kind })}
        />
        {precipitation.kind !== "none" && (
          <LabeledSlider
            label="Intensity"
            value={precipitation.intensity}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setPrecipitation({ intensity: v })}
          />
        )}
      </Section>

      <Divider />

      {/* Wetness */}
      <Section
        icon={<Droplets size={11} color="#7da6e8" />}
        label="Surface wetness"
      >
        <LabeledSlider
          label="Wetness"
          value={wetness}
          min={0}
          max={1}
          step={0.01}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={setWetness}
        />
        <CheckboxRow
          label="Auto-link to precipitation"
          checked={autoLinkWetness}
          onChange={setAutoLinkWetness}
        />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Divider() {
  return (
    <div
      css={css({
        height: "1px",
        backgroundColor: "#1e1e22",
        margin: "2px 0",
      })}
    />
  );
}

function Section({
  icon,
  label,
  toggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  toggle?: { checked: boolean; onChange: (v: boolean) => void };
  children: React.ReactNode;
}) {
  return (
    <div
      css={css({
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      })}
    >
      <label
        css={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "#a0a0aa",
          fontWeight: "600",
          userSelect: "none",
          cursor: toggle ? "pointer" : "default",
        })}
      >
        <span css={css({ display: "flex", alignItems: "center", gap: "5px" })}>
          {icon}
          {label}
        </span>
        {toggle && (
          <input
            type="checkbox"
            checked={toggle.checked}
            onChange={(e) => toggle.onChange(e.target.checked)}
            css={css({ accentColor: "#3b82f6", margin: 0 })}
          />
        )}
      </label>
      {children}
    </div>
  );
}

function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div css={css({ paddingLeft: "16px" })}>
      <div
        css={css({
          display: "flex",
          justifyContent: "space-between",
          fontSize: "10px",
          color: "#a0a0aa",
          marginBottom: "3px",
        })}
      >
        <span>{label}</span>
        <span css={css({ color: "#e8e8ec", fontFamily: "monospace" })}>
          {formatValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        css={css({ width: "100%", accentColor: "#3b82f6" })}
      />
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      css={css({
        paddingLeft: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "10px",
        color: "#a0a0aa",
      })}
    >
      <span>{label}</span>
      <div css={css({ display: "flex", alignItems: "center", gap: "6px" })}>
        <span css={css({ fontFamily: "monospace", color: "#e8e8ec" })}>{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          css={css({
            width: "22px",
            height: "16px",
            border: "1px solid #2a2a2e",
            borderRadius: "3px",
            cursor: "pointer",
            backgroundColor: "transparent",
            padding: 0,
          })}
        />
      </div>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      css={css({
        paddingLeft: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "10px",
        color: "#a0a0aa",
        cursor: "pointer",
        userSelect: "none",
      })}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        css={css({ accentColor: "#3b82f6", margin: 0 })}
      />
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div
      css={css({
        paddingLeft: "16px",
        fontSize: "9px",
        color: "#4a4a54",
        lineHeight: "1.4",
      })}
    >
      {children}
    </div>
  );
}

function PresetChip({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      css={css({
        backgroundColor: "#1e1e22",
        border: "1px solid #2a2a2e",
        borderRadius: "12px",
        padding: "3px 10px",
        color: "#a0a0aa",
        fontSize: "10px",
        cursor: "pointer",
        transition: "0.15s",
        ":hover": {
          backgroundColor: "#2a2a2e",
          color: "#e8e8ec",
          borderColor: "#3a3a3e",
        },
      })}
    >
      {label}
    </button>
  );
}

const PRECIP_OPTIONS: { id: Precipitation; label: string; icon: React.ReactNode }[] = [
  { id: "none", label: "None", icon: <Sun size={10} color="#fbbf24" /> },
  { id: "drizzle", label: "Drizzle", icon: <CloudRain size={10} color="#7da6e8" /> },
  { id: "rain", label: "Rain", icon: <CloudRain size={10} color="#7da6e8" /> },
  { id: "heavy", label: "Heavy", icon: <CloudRain size={10} color="#7da6e8" /> },
  { id: "snow", label: "Snow", icon: <CloudSnow size={10} color="#e8e8ec" /> },
  { id: "snowstorm", label: "Snowstorm", icon: <CloudSnow size={10} color="#e8e8ec" /> },
];

function PrecipKindRow({
  value,
  onChange,
}: {
  value: Precipitation;
  onChange: (v: Precipitation) => void;
}) {
  return (
    <div
      css={css({
        paddingLeft: "16px",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "4px",
      })}
    >
      {PRECIP_OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            css={css({
              backgroundColor: active ? "#3b82f6" : "#1e1e22",
              border: `1px solid ${active ? "#2563eb" : "#2a2a2e"}`,
              borderRadius: "5px",
              padding: "4px 6px",
              color: active ? "#fff" : "#a0a0aa",
              fontSize: "10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              transition: "0.15s",
              ":hover": {
                backgroundColor: active ? "#2563eb" : "#2a2a2e",
                color: "#e8e8ec",
              },
            })}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compass dial — drag-rotate to set wind direction. Renders an SVG circle
 * with a needle pointing in the wind's compass direction. Click anywhere
 * on the dial to snap the needle to that bearing; mouse-drag for fine
 * control.
 */
function CompassDial({
  direction,
  onChange,
}: {
  direction: number;
  onChange: (deg: number) => void;
}) {
  const SIZE = 80;
  const CENTER = SIZE / 2;
  const RADIUS = SIZE / 2 - 4;

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.buttons === 0 && e.type === "pointermove") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - CENTER;
    const y = e.clientY - rect.top - CENTER;
    // SVG y is down; flip so "up" = 0° = north.
    const bearing = (Math.atan2(x, -y) * 180) / Math.PI;
    onChange(bearing);
  };

  // Needle endpoint — direction is "wind blows toward", so the needle
  // points along that bearing.
  const rad = (direction * Math.PI) / 180;
  const nx = CENTER + Math.sin(rad) * (RADIUS - 4);
  const ny = CENTER - Math.cos(rad) * (RADIUS - 4);

  return (
    <div
      css={css({
        paddingLeft: "16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
      })}
    >
      <svg
        width={SIZE}
        height={SIZE}
        onPointerDown={handlePointer}
        onPointerMove={handlePointer}
        css={css({
          cursor: "grab",
          touchAction: "none",
          ":active": { cursor: "grabbing" },
        })}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="#1e1e22"
          stroke="#2a2a2e"
          strokeWidth={1}
        />
        {/* Cardinal markers */}
        {["N", "E", "S", "W"].map((label, i) => {
          const angle = (i * 90 * Math.PI) / 180;
          const tx = CENTER + Math.sin(angle) * (RADIUS - 8);
          const ty = CENTER - Math.cos(angle) * (RADIUS - 8) + 3;
          return (
            <text
              key={label}
              x={tx}
              y={ty}
              fontSize={9}
              fill="#6b6b78"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {label}
            </text>
          );
        })}
        {/* Needle */}
        <line
          x1={CENTER}
          y1={CENTER}
          x2={nx}
          y2={ny}
          stroke="#3b82f6"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={nx} cy={ny} r={3} fill="#3b82f6" />
        <circle cx={CENTER} cy={CENTER} r={2} fill="#7da6e8" />
      </svg>
      <div css={css({ display: "flex", flexDirection: "column", gap: "2px" })}>
        <span css={css({ fontSize: "10px", color: "#a0a0aa" })}>Direction</span>
        <span
          css={css({
            fontSize: "14px",
            color: "#e8e8ec",
            fontFamily: "monospace",
          })}
        >
          {Math.round(direction)}° {compassFromBearing(direction)}
        </span>
      </div>
    </div>
  );
}
