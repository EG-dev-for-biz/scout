// GenerateObjectModal.tsx
//
// Two-pane modal for generating a 3D prop from either the current
// viewport or an uploaded image. Mirrors RestyleModal's shape (capture
// → preview → call AI → review → commit) but the commit step pushes
// the resulting GLB into `pendingGlbUrl` so the next scene click drops
// it as a placed object instead of saving an image to disk.

import React, { useEffect, useRef, useState } from "react";
import { css, keyframes } from "@emotion/react";
import {
  Box,
  X,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Terminal,
  Image as ImageIcon,
} from "lucide-react";
import { captureCanvasSnapshot } from "@/utils/geminiRestyle";
import { useImageToMesh, useMeshInstallStatus } from "@/hooks/useImageToMesh";
import { useGeneratedObjectStore } from "@/state/generatedObjectStore";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Source = "viewport" | "upload";

// ──────────────────────────────────────────────────────────────────────────

export function GenerateObjectModal({ isOpen, onClose }: Props) {
  const installStatus = useMeshInstallStatus();
  const setPending = useGeneratedObjectStore((s) => s.setPending);
  const { generating, progress, step, error, result, generate, cancel } =
    useImageToMesh();

  const [source, setSource] = useState<Source>("viewport");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const [textureRes, setTextureRes] = useState<512 | 1024 | 2048>(1024);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // On open: snap the current viewport as the default source image.
  useEffect(() => {
    if (!isOpen) return;
    setSource("viewport");
    const raf = requestAnimationFrame(() => {
      const snap = captureCanvasSnapshot();
      setSourceImage(snap);
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  // Recapture viewport when user switches back to it.
  useEffect(() => {
    if (!isOpen) return;
    if (source !== "viewport") return;
    const snap = captureCanvasSnapshot();
    if (snap) setSourceImage(snap);
  }, [source, isOpen]);

  const handleFile = (file: File | undefined | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSourceImage(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!sourceImage) return;
    const glbUrl = await generate({
      imageDataUrl: sourceImage,
      removeBg,
      textureResolution: textureRes,
    });
    if (glbUrl) {
      setPending(glbUrl, { sourceThumb: sourceImage, suggestedName: "AI Prop" });
    }
  };

  const handlePlace = () => {
    // Pending is already set after generate() success — just close.
    onClose();
  };

  if (!isOpen) return null;

  const showInstallGate =
    installStatus !== null && !installStatus.installed && !generating;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !generating) onClose();
      }}
      css={css({
        position: "fixed",
        inset: 0,
        zIndex: 4000,
        backgroundColor: "rgba(8,8,10,0.85)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      })}
    >
      <div
        css={css({
          width: "100%",
          maxWidth: "1100px",
          maxHeight: "90vh",
          backgroundColor: "#15151a",
          border: "1px solid #2a2a2e",
          borderRadius: "12px",
          boxShadow: "0 12px 60px rgba(0,0,0,0.7)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        })}
      >
        {/* Header */}
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid #2a2a2e",
            flexShrink: 0,
          })}
        >
          <div css={css({ display: "flex", alignItems: "center", gap: "8px" })}>
            <Box size={15} color="#22d3ee" />
            <span css={css({ fontSize: "14px", fontWeight: 700, color: "#e8e8ec" })}>
              Generate 3D Prop
            </span>
            <span
              css={css({ fontSize: "11px", color: "#6b6b78", marginLeft: "8px" })}
            >
              powered by Stable-Fast-3D (local)
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={generating}
            css={css({
              background: "none",
              border: "none",
              cursor: generating ? "not-allowed" : "pointer",
              color: "#6b6b78",
              opacity: generating ? 0.4 : 1,
              display: "flex",
              padding: "4px",
              ":hover:not(:disabled)": { color: "#e8e8ec" },
            })}
          >
            <X size={16} />
          </button>
        </div>

        {showInstallGate ? (
          <InstallGate status={installStatus!} />
        ) : (
          <>
            {/* Source picker + options row */}
            <div
              css={css({
                display: "flex",
                gap: "8px",
                padding: "12px 20px",
                borderBottom: "1px solid #2a2a2e",
                alignItems: "center",
                flexWrap: "wrap",
                flexShrink: 0,
              })}
            >
              <SourceTab
                active={source === "viewport"}
                onClick={() => setSource("viewport")}
                icon={<ImageIcon size={12} />}
                label="From viewport"
              />
              <SourceTab
                active={source === "upload"}
                onClick={() => {
                  setSource("upload");
                  fileInputRef.current?.click();
                }}
                icon={<Upload size={12} />}
                label="From image"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />

              <div
                css={css({
                  width: "1px",
                  height: "20px",
                  backgroundColor: "#2a2a2e",
                  marginInline: "4px",
                })}
              />

              <ToggleChip
                label="Remove background"
                value={removeBg}
                onChange={setRemoveBg}
                disabled={generating}
              />

              <SelectChip
                label="Texture"
                value={`${textureRes}`}
                options={["512", "1024", "2048"]}
                onChange={(v) =>
                  setTextureRes((Number(v) as 512 | 1024 | 2048) ?? 1024)
                }
                disabled={generating}
              />
            </div>

            {/* Side-by-side preview */}
            <div
              css={css({
                flex: 1,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                padding: "16px 20px",
                overflow: "hidden",
                minHeight: 0,
              })}
            >
              {/* Source */}
              <PreviewPane label="Source image" accent="#6b6b78">
                {sourceImage ? (
                  <img
                    src={sourceImage}
                    alt="Source"
                    css={css({
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                    })}
                  />
                ) : (
                  <span css={css({ color: "#4a4a54", fontSize: "12px" })}>
                    No source captured
                  </span>
                )}
              </PreviewPane>

              {/* Generated */}
              <PreviewPane label="Generated mesh" accent="#22d3ee">
                {generating ? (
                  <ProgressPanel
                    pct={progress}
                    step={step}
                    onCancel={cancel}
                  />
                ) : error ? (
                  <ErrorPanel message={error} />
                ) : result ? (
                  <SuccessPanel elapsedMs={result.elapsedMs} />
                ) : (
                  <span
                    css={css({
                      color: "#4a4a54",
                      fontSize: "12px",
                      textAlign: "center",
                      padding: "20px",
                      lineHeight: 1.6,
                    })}
                  >
                    Click <strong style={{ color: "#22d3ee" }}>Generate</strong>{" "}
                    below.
                    <br />
                    Typical time: 5–15 seconds on Apple Silicon.
                  </span>
                )}
              </PreviewPane>
            </div>

            {/* Action row */}
            <div
              css={css({
                padding: "12px 20px",
                borderTop: "1px solid #2a2a2e",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              })}
            >
              <button
                onClick={onClose}
                disabled={generating}
                css={css({
                  backgroundColor: "transparent",
                  border: "1px solid #2a2a2e",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  color: "#a0a0aa",
                  fontSize: "12px",
                  cursor: generating ? "not-allowed" : "pointer",
                  opacity: generating ? 0.5 : 1,
                  ":hover:not(:disabled)": {
                    color: "#e8e8ec",
                    borderColor: "#3a3a3e",
                  },
                })}
              >
                Cancel
              </button>

              {result ? (
                <button
                  onClick={handlePlace}
                  css={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background:
                      "linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 16px",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 2px 12px rgba(34,211,238,0.4)",
                    transition: "0.15s",
                    ":hover": {
                      boxShadow: "0 4px 18px rgba(34,211,238,0.6)",
                    },
                  })}
                >
                  <CheckCircle2 size={12} /> Place in scene
                </button>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={generating || !sourceImage}
                  css={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: generating
                      ? "#1a3a3a"
                      : "linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 16px",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor:
                      generating || !sourceImage ? "not-allowed" : "pointer",
                    opacity: !sourceImage ? 0.5 : 1,
                    boxShadow: generating
                      ? "none"
                      : "0 2px 12px rgba(34,211,238,0.4)",
                    transition: "0.15s",
                    ":hover:not(:disabled)": {
                      boxShadow: "0 4px 18px rgba(34,211,238,0.6)",
                    },
                  })}
                >
                  {generating ? (
                    <Loader2
                      size={12}
                      css={css({ animation: `${spin} 1s linear infinite` })}
                    />
                  ) : (
                    <Box size={12} />
                  )}
                  {generating ? "Generating…" : "Generate"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Small subcomponents ──────────────────────────────────────────────────

function SourceTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "5px 10px",
        borderRadius: "6px",
        border: `1px solid ${active ? "#22d3ee" : "#2a2a2e"}`,
        backgroundColor: active ? "#0e2a30" : "#1a1a1f",
        color: active ? "#e8e8ec" : "#a0a0aa",
        fontSize: "11px",
        fontWeight: 500,
        cursor: "pointer",
        transition: "0.15s",
        ":hover": { backgroundColor: active ? "#0e2a30" : "#2a2a2e" },
      })}
    >
      {icon}
      {label}
    </button>
  );
}

function ToggleChip({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      disabled={disabled}
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 10px",
        borderRadius: "6px",
        border: `1px solid ${value ? "#22d3ee" : "#2a2a2e"}`,
        backgroundColor: value ? "#0e2a30" : "#1a1a1f",
        color: value ? "#e8e8ec" : "#a0a0aa",
        fontSize: "11px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <span
        css={css({
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: value ? "#22d3ee" : "#3a3a3e",
        })}
      />
      {label}
    </button>
  );
}

function SelectChip({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "11px",
        color: "#a0a0aa",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        css={css({
          background: "#1a1a1f",
          border: "1px solid #2a2a2e",
          borderRadius: "6px",
          padding: "4px 6px",
          color: "#e8e8ec",
          fontSize: "11px",
          cursor: disabled ? "not-allowed" : "pointer",
        })}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function PreviewPane({
  label,
  accent,
  children,
}: {
  label: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      css={css({
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minHeight: 0,
      })}
    >
      <div
        css={css({
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: accent,
          fontWeight: 600,
        })}
      >
        {label}
      </div>
      <div
        css={css({
          flex: 1,
          backgroundColor: "#0a0a0c",
          border: "1px solid #2a2a2e",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
          minHeight: 0,
        })}
      >
        {children}
      </div>
    </div>
  );
}

function ProgressPanel({
  pct,
  step,
  onCancel,
}: {
  pct: number;
  step: string;
  onCancel: () => void;
}) {
  return (
    <div
      css={css({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        color: "#22d3ee",
        fontSize: 12,
        width: "70%",
      })}
    >
      <Loader2
        size={26}
        css={css({ animation: `${spin} 1s linear infinite` })}
      />
      <div css={css({ color: "#a0a0aa" })}>{step || "Working…"}</div>
      <div
        css={css({
          width: "100%",
          height: 4,
          borderRadius: 2,
          background: "#1e1e22",
          overflow: "hidden",
        })}
      >
        <div
          css={css({
            width: `${pct}%`,
            height: "100%",
            background: "linear-gradient(90deg,#22d3ee,#3b82f6)",
            transition: "width 0.2s linear",
          })}
        />
      </div>
      <div css={css({ color: "#6b6b78", fontSize: 10 })}>{pct}%</div>
      <button
        onClick={onCancel}
        css={css({
          marginTop: 4,
          background: "transparent",
          border: "1px solid #3a3a3e",
          borderRadius: 6,
          padding: "4px 10px",
          color: "#a0a0aa",
          fontSize: 11,
          cursor: "pointer",
          ":hover": { color: "#fca5a5", borderColor: "#7f1d1d" },
        })}
      >
        Cancel
      </button>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div
      css={css({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        color: "#ef4444",
        fontSize: 12,
        padding: 16,
        textAlign: "center",
      })}
    >
      <AlertCircle size={20} />
      <div>{message}</div>
    </div>
  );
}

function SuccessPanel({ elapsedMs }: { elapsedMs: number }) {
  return (
    <div
      css={css({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        color: "#22d3ee",
        fontSize: 12,
        padding: 16,
        textAlign: "center",
      })}
    >
      <CheckCircle2 size={28} />
      <div css={css({ color: "#e8e8ec" })}>Mesh ready</div>
      <div css={css({ color: "#6b6b78", fontSize: 10 })}>
        Generated in {(elapsedMs / 1000).toFixed(1)}s
      </div>
      <div
        css={css({
          color: "#6b6b78",
          fontSize: 11,
          marginTop: 6,
          maxWidth: 260,
          lineHeight: 1.5,
        })}
      >
        Click <strong style={{ color: "#22d3ee" }}>Place in scene</strong>,
        then click anywhere in the viewport to drop your prop.
      </div>
    </div>
  );
}

function InstallGate({ status }: { status: MeshInstallStatusLite }) {
  return (
    <div
      css={css({
        padding: "24px 20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      })}
    >
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "#fbbf24",
          fontSize: 13,
          fontWeight: 600,
        })}
      >
        <Terminal size={16} /> Stable-Fast-3D is not installed yet
      </div>
      <div
        css={css({
          color: "#a0a0aa",
          fontSize: 12,
          lineHeight: 1.6,
        })}
      >
        Scout3D's local prop generator runs Stability AI's Stable-Fast-3D
        in a Python virtual environment on your machine. Run the installer
        once; it takes about 10 minutes and ~3 GB of disk.
      </div>
      <div
        css={css({
          background: "#0a0a0c",
          border: "1px solid #2a2a2e",
          borderRadius: 8,
          padding: 12,
          fontFamily: "monospace",
          fontSize: 11,
          color: "#22d3ee",
          userSelect: "all",
        })}
      >
        {`bash ${"$"}{SCOUT3D_REPO}/scripts/install-sf3d.sh`}
      </div>
      <div
        css={css({
          fontSize: 11,
          color: "#6b6b78",
        })}
      >
        Looking for the marker at <code>{status.sf3dHome}/.installed</code>
      </div>
    </div>
  );
}

// Local lightweight type so we don't drag the hook's into this scope.
interface MeshInstallStatusLite {
  installed: boolean;
  sf3dHome: string;
}
