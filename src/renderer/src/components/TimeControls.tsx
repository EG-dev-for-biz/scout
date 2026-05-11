import React, { useRef } from "react";
import { css } from "@emotion/react";
import {
  Sun,
  Moon,
  Sunrise,
  Clock,
  Cloud,
  Sparkles,
  Clapperboard,
  Film,
  Upload,
  X,
} from "lucide-react";
import { useTimeStore } from "@/state/timeStore";
import { useAreaStore } from "@/state/areaStore";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";
import { useCinemaStore, BUILT_IN_LUTS } from "@/state/cinemaStore";
import { useViewportStore } from "@/state/viewportStore";
import {
  getSolarPosition,
  formatSolarPosition,
  isDaytime,
} from "@/utils/solarPosition";

/**
 * Time-of-day + date controls. Drives sun position when
 * `solarLightingEnabled` is true.
 *
 * Sits in the right or top of the UI. Compact form factor.
 */
export function TimeControls() {
  const {
    date,
    setDate,
    setHour,
    solarLightingEnabled,
    setSolarLightingEnabled,
    atmosphereEnabled,
    setAtmosphereEnabled,
    cloudsEnabled,
    setCloudsEnabled,
    cloudCoverage,
    setCloudCoverage,
    shadowsEnabled,
    setShadowsEnabled,
    lensFlareEnabled,
    setLensFlareEnabled,
    lensFlareIntensity,
    setLensFlareIntensity,
  } = useTimeStore();
  const center = useAreaStore((s) => s.center);
  // Painted skybox forces the legacy path; surface that to the user so
  // they understand why the atmosphere toggle has no visible effect.
  const paintedSky = usePaintedSceneStore((s) => s.skyTexture);

  // Cinema toolkit — LUT (file/dropdown/intensity) + anamorphic preset.
  const lutEnabled = useCinemaStore((s) => s.lutEnabled);
  const lutName = useCinemaStore((s) => s.lutName);
  const lutUrl = useCinemaStore((s) => s.lutUrl);
  const lutIntensity = useCinemaStore((s) => s.lutIntensity);
  const setLut = useCinemaStore((s) => s.setLut);
  const clearLut = useCinemaStore((s) => s.clearLut);
  const setLutEnabled = useCinemaStore((s) => s.setLutEnabled);
  const setLutIntensity = useCinemaStore((s) => s.setLutIntensity);

  const aspectRatio = useViewportStore((s) => s.aspectRatio);
  const setAspectRatio = useViewportStore((s) => s.setAspectRatio);
  const anamorphicEnabled = aspectRatio === "anamorphic";

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLutFile = (file: File) => {
    // Object URL is reachable from the LUTCubeLoader's fetch inside Electron's
    // renderer process. Free the previous one if it was a blob URL.
    if (lutUrl && lutUrl.startsWith("blob:")) URL.revokeObjectURL(lutUrl);
    const url = URL.createObjectURL(file);
    setLut(file.name, url);
  };

  const handleBuiltInLut = (id: string) => {
    if (lutUrl && lutUrl.startsWith("blob:")) URL.revokeObjectURL(lutUrl);
    if (!id) {
      clearLut();
      return;
    }
    const lut = BUILT_IN_LUTS.find((l) => l.id === id);
    if (lut) setLut(lut.name, lut.url);
  };

  const lat = (center[0].lat + center[1].lat) / 2;
  const lng = (center[0].lng + center[1].lng) / 2;
  const sun = getSolarPosition(date, lat, lng);
  const isDay = isDaytime(date, lat, lng);

  const minutes = date.getHours() * 60 + date.getMinutes();
  const dateString = date.toISOString().slice(0, 10);

  const handleHourSlider = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    setHour(h, m);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [yyyy, mm, dd] = e.target.value.split("-").map(Number);
    if (!yyyy || !mm || !dd) return;
    const d = new Date(date);
    d.setFullYear(yyyy, mm - 1, dd);
    setDate(d);
  };

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    return `${hh}:${mm}`;
  };

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
        gap: "8px",
      })}
    >
      {/* Header */}
      <div
        css={css({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        })}
      >
        <div css={css({ display: "flex", alignItems: "center", gap: "6px" })}>
          {isDay ? (
            <Sun size={13} color="#fbbf24" />
          ) : (
            <Moon size={13} color="#7da6e8" />
          )}
          <span css={css({ fontSize: "12px", fontWeight: "600", color: "#e8e8ec" })}>
            Sun & Time
          </span>
        </div>

        {/* Solar lighting toggle — locked on while atmosphere is active
            (the atmospheric rig always uses real solar position). */}
        <label
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "10px",
            color: atmosphereEnabled ? "#4a4a54" : "#6b6b78",
            cursor: atmosphereEnabled ? "not-allowed" : "pointer",
            userSelect: "none",
          })}
          title={
            atmosphereEnabled
              ? "Atmospheric rendering always uses real solar position"
              : undefined
          }
        >
          <input
            type="checkbox"
            checked={solarLightingEnabled}
            disabled={atmosphereEnabled}
            onChange={(e) => setSolarLightingEnabled(e.target.checked)}
            css={css({ accentColor: "#3b82f6", margin: 0 })}
          />
          Drive lights
        </label>
      </div>

      {/* Date input */}
      <div css={css({ display: "flex", alignItems: "center", gap: "8px" })}>
        <Clock size={11} color="#6b6b78" />
        <input
          type="date"
          value={dateString}
          onChange={handleDateChange}
          css={css({
            flex: 1,
            backgroundColor: "#0f0f11",
            border: "1px solid #2a2a2e",
            borderRadius: "5px",
            padding: "4px 8px",
            color: "#e8e8ec",
            fontSize: "11px",
            outline: "none",
            colorScheme: "dark",
            ":focus": { borderColor: "#3b82f6" },
          })}
        />
      </div>

      {/* Time slider */}
      <div>
        <div
          css={css({
            display: "flex",
            justifyContent: "space-between",
            fontSize: "10px",
            color: "#a0a0aa",
            marginBottom: "4px",
          })}
        >
          <span>Time of day</span>
          <span css={css({ color: "#e8e8ec", fontFamily: "monospace" })}>
            {formatTime(minutes)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1439}
          value={minutes}
          onChange={(e) => handleHourSlider(parseInt(e.target.value, 10))}
          css={css({
            width: "100%",
            accentColor: "#3b82f6",
          })}
        />
        {/* Tick labels */}
        <div
          css={css({
            display: "flex",
            justifyContent: "space-between",
            fontSize: "9px",
            color: "#4a4a54",
            marginTop: "2px",
          })}
        >
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
      </div>

      {/* Sun position readout */}
      <div
        css={css({
          backgroundColor: "#0f0f11",
          border: "1px solid #1e1e22",
          borderRadius: "6px",
          padding: "6px 8px",
          fontSize: "10px",
          color: "#a0a0aa",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        })}
      >
        <span>{formatSolarPosition(sun)}</span>
        {!solarLightingEnabled && (
          <span css={css({ fontSize: "9px", color: "#4a4a54" })}>
            preview
          </span>
        )}
      </div>

      {/* Quick presets */}
      <div css={css({ display: "flex", gap: "5px" })}>
        <PresetBtn
          label="Sunrise"
          icon={<Sunrise size={10} />}
          onClick={() => setHour(6, 30)}
        />
        <PresetBtn
          label="Noon"
          icon={<Sun size={10} />}
          onClick={() => setHour(12, 0)}
        />
        <PresetBtn
          label="Golden"
          icon={<Sun size={10} />}
          onClick={() => setHour(17, 30)}
        />
        <PresetBtn
          label="Night"
          icon={<Moon size={10} />}
          onClick={() => setHour(22, 0)}
        />
      </div>

      {/* Atmosphere section — divides cleanly from time controls and
          owns the takram atmospheric rig toggles. */}
      <div
        css={css({
          marginTop: "4px",
          paddingTop: "8px",
          borderTop: "1px solid #2a2a2e",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        })}
      >
        {/* Master toggle */}
        <label
          css={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none",
          })}
        >
          <span
            css={css({
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: "600",
              color: "#e8e8ec",
            })}
          >
            <Sparkles size={13} color="#7da6e8" />
            Atmospheric rendering
          </span>
          <input
            type="checkbox"
            checked={atmosphereEnabled}
            onChange={(e) => setAtmosphereEnabled(e.target.checked)}
            css={css({ accentColor: "#3b82f6", margin: 0 })}
          />
        </label>

        {atmosphereEnabled && paintedSky && (
          <div
            css={css({
              fontSize: "10px",
              color: "#d97757",
              backgroundColor: "#2a1a0e",
              border: "1px solid #4a2818",
              borderRadius: "5px",
              padding: "6px 8px",
              lineHeight: "1.4",
            })}
          >
            Painted skybox is active — atmosphere is paused while a painted
            sky is set. Clear the painted sky to use physical atmosphere.
          </div>
        )}

        {atmosphereEnabled && (
          <div
            css={css({
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              paddingLeft: "4px",
            })}
          >
            <SubToggle
              label="Sun shadows"
              icon={<Sun size={11} color="#fbbf24" />}
              checked={shadowsEnabled}
              onChange={setShadowsEnabled}
            />

            <SubToggle
              label="Volumetric clouds"
              icon={<Cloud size={11} color="#a0a0aa" />}
              checked={cloudsEnabled}
              onChange={setCloudsEnabled}
            />

            {cloudsEnabled && (
              <div css={css({ paddingLeft: "18px" })}>
                <div
                  css={css({
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "10px",
                    color: "#a0a0aa",
                    marginBottom: "3px",
                  })}
                >
                  <span>Coverage</span>
                  <span
                    css={css({ color: "#e8e8ec", fontFamily: "monospace" })}
                  >
                    {Math.round(cloudCoverage * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={cloudCoverage}
                  onChange={(e) =>
                    setCloudCoverage(parseFloat(e.target.value))
                  }
                  css={css({ width: "100%", accentColor: "#3b82f6" })}
                />
              </div>
            )}

            <SubToggle
              label="Lens flare"
              icon={<Sparkles size={11} color="#fbbf24" />}
              checked={lensFlareEnabled}
              onChange={setLensFlareEnabled}
            />

            {lensFlareEnabled && (
              <div css={css({ paddingLeft: "18px" })}>
                <div
                  css={css({
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "10px",
                    color: "#a0a0aa",
                    marginBottom: "3px",
                  })}
                >
                  <span>Flare intensity</span>
                  <span
                    css={css({
                      color: "#e8e8ec",
                      fontFamily: "monospace",
                    })}
                  >
                    {Math.round(lensFlareIntensity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={lensFlareIntensity}
                  onChange={(e) =>
                    setLensFlareIntensity(parseFloat(e.target.value))
                  }
                  css={css({ width: "100%", accentColor: "#3b82f6" })}
                />
                <div
                  css={css({
                    fontSize: "9px",
                    color: "#4a4a54",
                    lineHeight: "1.3",
                    marginTop: "2px",
                  })}
                >
                  Chromatic streaks are screen-space — lower this when the
                  sun is behind geometry to avoid bands crossing buildings.
                </div>
              </div>
            )}

            <div
              css={css({
                fontSize: "9px",
                color: "#4a4a54",
                lineHeight: "1.4",
                marginTop: "2px",
              })}
            >
              Replaces the style sky + lights with a physical atmosphere
              driven by date/time and scene lat/lng.
            </div>
          </div>
        )}
      </div>

      {/* Cinema section — anamorphic preset + 3D LUT loader. Works in both
          atmospheric and legacy render paths. */}
      <div
        css={css({
          marginTop: "4px",
          paddingTop: "8px",
          borderTop: "1px solid #2a2a2e",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        })}
      >
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            fontWeight: "600",
            color: "#e8e8ec",
          })}
        >
          <Clapperboard size={13} color="#d97757" />
          Cinema
        </div>

        {/* Anamorphic preset toggle */}
        <SubToggle
          label="Anamorphic 2.39:1"
          icon={<Film size={11} color="#d97757" />}
          checked={anamorphicEnabled}
          onChange={(on) => setAspectRatio(on ? "anamorphic" : "free")}
        />

        {/* LUT picker */}
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          })}
        >
          <div
            css={css({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "#a0a0aa",
            })}
          >
            <span>3D LUT</span>
            {lutEnabled && lutName ? (
              <button
                onClick={() => clearLut()}
                title="Remove LUT"
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#6b6b78",
                  fontSize: "10px",
                  padding: 0,
                  ":hover": { color: "#e8e8ec" },
                })}
              >
                <X size={10} /> clear
              </button>
            ) : null}
          </div>

          {/* Built-in LUT dropdown — none = use file picker below */}
          <select
            value={
              lutEnabled &&
              BUILT_IN_LUTS.find((l) => l.url === lutUrl)?.id
                ? BUILT_IN_LUTS.find((l) => l.url === lutUrl)!.id
                : ""
            }
            onChange={(e) => handleBuiltInLut(e.target.value)}
            css={css({
              backgroundColor: "#0f0f11",
              border: "1px solid #2a2a2e",
              borderRadius: "5px",
              padding: "5px 8px",
              color: "#e8e8ec",
              fontSize: "11px",
              outline: "none",
              colorScheme: "dark",
              cursor: "pointer",
              ":focus": { borderColor: "#3b82f6" },
            })}
          >
            <option value="">
              {lutEnabled && lutName ? `Custom: ${lutName}` : "Choose a LUT…"}
            </option>
            {BUILT_IN_LUTS.map((lut) => (
              <option key={lut.id} value={lut.id}>
                {lut.name}
              </option>
            ))}
          </select>

          {/* Hidden file input + drag-friendly button */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".cube"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleLutFile(f);
              e.target.value = "";
            }}
            css={css({ display: "none" })}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            css={css({
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              backgroundColor: "#1e1e22",
              border: "1px dashed #3a3a3e",
              borderRadius: "5px",
              padding: "6px 8px",
              color: "#a0a0aa",
              fontSize: "10px",
              cursor: "pointer",
              transition: "0.15s",
              ":hover": {
                backgroundColor: "#2a2a2e",
                color: "#e8e8ec",
                borderColor: "#4a4a54",
              },
            })}
          >
            <Upload size={10} /> Load .cube file
          </button>

          {/* Enabled toggle + intensity slider — shown only when a LUT is
              chosen (built-in or custom). */}
          {(lutEnabled || lutUrl) && (
            <>
              <SubToggle
                label="LUT enabled"
                icon={<Film size={11} color="#7da6e8" />}
                checked={lutEnabled}
                onChange={setLutEnabled}
              />

              {lutEnabled && (
                <div>
                  <div
                    css={css({
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "10px",
                      color: "#a0a0aa",
                      marginBottom: "3px",
                    })}
                  >
                    <span>Intensity</span>
                    <span
                      css={css({
                        color: "#e8e8ec",
                        fontFamily: "monospace",
                      })}
                    >
                      {Math.round(lutIntensity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={lutIntensity}
                    onChange={(e) =>
                      setLutIntensity(parseFloat(e.target.value))
                    }
                    css={css({
                      width: "100%",
                      accentColor: "#3b82f6",
                    })}
                  />
                </div>
              )}
            </>
          )}

          <div
            css={css({
              fontSize: "9px",
              color: "#4a4a54",
              lineHeight: "1.4",
            })}
          >
            LUTs apply after color grading and before final tonemap. Anamorphic
            also forces lens flare and slight gate FX.
          </div>
        </div>
      </div>
    </div>
  );
}

function SubToggle({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      css={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
        userSelect: "none",
        fontSize: "11px",
        color: "#a0a0aa",
      })}
    >
      <span
        css={css({ display: "flex", alignItems: "center", gap: "5px" })}
      >
        {icon}
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        css={css({ accentColor: "#3b82f6", margin: 0 })}
      />
    </label>
  );
}

function PresetBtn({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      css={css({
        flex: 1,
        backgroundColor: "#1e1e22",
        border: "1px solid #2a2a2e",
        borderRadius: "5px",
        padding: "5px 4px",
        color: "#a0a0aa",
        fontSize: "10px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2px",
        transition: "0.15s",
        ":hover": {
          backgroundColor: "#2a2a2e",
          color: "#e8e8ec",
        },
      })}
    >
      {icon}
      {label}
    </button>
  );
}
