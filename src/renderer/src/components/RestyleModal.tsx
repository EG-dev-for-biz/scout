import React, { useEffect, useState } from "react";
import { css, keyframes } from "@emotion/react";
import { Sparkles, X, Download, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import {
  restyleImage,
  captureCanvasSnapshot,
  hasGeminiKey,
  GeminiRestyleError,
} from "@/utils/geminiRestyle";
import { useStyleStore, STYLE_PRESETS, StyleProfile } from "@/state/styleStore";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

interface RestyleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The headline AI feature. Captures the current 3D viewport, sends it to
 * Gemini's image-edit model with the active StyleProfile's restylePrompt,
 * and shows original vs restyled side-by-side with a download option.
 *
 * The user can pick a *different* style without leaving the modal — useful
 * for "let me see this same shot in 3 different looks" workflows.
 */
export function RestyleModal({ isOpen, onClose }: RestyleModalProps) {
  const activeStyle = useStyleStore((s) => s.active);

  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [restyledImage, setRestyledImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosenStyleId, setChosenStyleId] = useState<string>(activeStyle.id);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const chosenStyle =
    STYLE_PRESETS.find((s) => s.id === chosenStyleId) ?? activeStyle;

  // Capture a fresh snapshot whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setRestyledImage(null);
    setError(null);
    setChosenStyleId(activeStyle.id);

    // Defer one frame so any pending render flushes
    const id = window.requestAnimationFrame(() => {
      const snap = captureCanvasSnapshot();
      if (!snap) {
        setError("Could not capture viewport — load a scene first.");
        setOriginalImage(null);
      } else {
        setOriginalImage(snap);
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [isOpen, activeStyle.id]);

  const runRestyle = async (style: StyleProfile) => {
    if (!originalImage) {
      setError("No source image captured.");
      return;
    }
    if (!hasGeminiKey()) {
      setError("VITE_GEMINI_API_KEY not configured in .env.local");
      return;
    }
    setLoading(true);
    setError(null);
    setRestyledImage(null);
    try {
      const result = await restyleImage({
        imageDataUrl: originalImage,
        prompt: style.restylePrompt,
      });
      setRestyledImage(result.imageDataUrl);
      setElapsedMs(result.elapsedMs);
    } catch (err) {
      if (err instanceof GeminiRestyleError) {
        setError(err.message);
      } else {
        setError(`Unexpected: ${(err as Error).message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!restyledImage) return;
    const a = document.createElement("a");
    a.href = restyledImage;
    a.download = `scout3d_${chosenStyle.id}_${Date.now()}.png`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
          maxWidth: "1200px",
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
            <Sparkles size={15} color="#a855f7" />
            <span css={css({ fontSize: "14px", fontWeight: "700", color: "#e8e8ec" })}>
              AI Restyle
            </span>
            <span css={css({ fontSize: "11px", color: "#6b6b78", marginLeft: "8px" })}>
              powered by Gemini
            </span>
          </div>
          <button
            onClick={onClose}
            css={css({
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#6b6b78",
              display: "flex",
              padding: "4px",
              ":hover": { color: "#e8e8ec" },
            })}
          >
            <X size={16} />
          </button>
        </div>

        {/* Style picker row */}
        <div
          css={css({
            display: "flex",
            gap: "6px",
            padding: "12px 20px",
            borderBottom: "1px solid #2a2a2e",
            overflowX: "auto",
            flexShrink: 0,
          })}
        >
          {STYLE_PRESETS.map((s) => (
            <button
              key={s.id}
              onClick={() => setChosenStyleId(s.id)}
              disabled={loading}
              css={css({
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "5px 10px",
                borderRadius: "6px",
                border: `1px solid ${chosenStyleId === s.id ? "#a855f7" : "#2a2a2e"}`,
                backgroundColor: chosenStyleId === s.id ? "#2a1a3a" : "#1a1a1f",
                color: chosenStyleId === s.id ? "#e8e8ec" : "#a0a0aa",
                fontSize: "11px",
                fontWeight: "500",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                transition: "0.15s",
                whiteSpace: "nowrap",
                ":hover:not(:disabled)": { backgroundColor: "#2a2a2e" },
              })}
            >
              <div
                css={css({
                  width: "12px",
                  height: "12px",
                  borderRadius: "3px",
                  background: `linear-gradient(135deg, ${s.sky.sunColor} 0%, ${s.materials.buildingHover} 100%)`,
                })}
              />
              {s.name}
            </button>
          ))}
        </div>

        {/* Image side-by-side */}
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
          {/* Original */}
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
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#6b6b78",
                fontWeight: "600",
              })}
            >
              Source — Scout3D Render
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
                minHeight: 0,
              })}
            >
              {originalImage ? (
                <img
                  src={originalImage}
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
            </div>
          </div>

          {/* Restyled */}
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
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#a855f7",
                fontWeight: "600",
                display: "flex",
                justifyContent: "space-between",
              })}
            >
              <span>AI Restyle — {chosenStyle.name}</span>
              {restyledImage && elapsedMs > 0 && (
                <span css={css({ color: "#6b6b78", fontWeight: "400" })}>
                  {(elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <div
              css={css({
                flex: 1,
                backgroundColor: "#0a0a0c",
                border: `1px solid ${error ? "#ef4444" : "#2a2a2e"}`,
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                position: "relative",
                minHeight: 0,
              })}
            >
              {loading && (
                <div
                  css={css({
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px",
                    color: "#a855f7",
                    fontSize: "12px",
                  })}
                >
                  <Loader2
                    size={28}
                    css={css({ animation: `${spin} 1s linear infinite` })}
                  />
                  <div css={css({ color: "#a0a0aa" })}>
                    Asking Gemini to restyle as <strong>{chosenStyle.name}</strong>…
                  </div>
                  <div css={css({ color: "#4a4a54", fontSize: "10px" })}>
                    typically 5–15 seconds
                  </div>
                </div>
              )}
              {!loading && error && (
                <div
                  css={css({
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                    color: "#ef4444",
                    fontSize: "12px",
                    padding: "16px",
                    textAlign: "center",
                  })}
                >
                  <AlertCircle size={20} />
                  <div>{error}</div>
                </div>
              )}
              {!loading && !error && !restyledImage && (
                <div
                  css={css({
                    color: "#4a4a54",
                    fontSize: "12px",
                    textAlign: "center",
                    padding: "20px",
                    lineHeight: "1.6",
                  })}
                >
                  Click <strong style={{ color: "#a855f7" }}>Restyle</strong> below
                  to generate
                </div>
              )}
              {!loading && restyledImage && (
                <img
                  src={restyledImage}
                  alt="Restyled"
                  css={css({
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  })}
                />
              )}
            </div>
          </div>
        </div>

        {/* Prompt preview */}
        <div
          css={css({
            padding: "8px 20px",
            backgroundColor: "#0a0a0c",
            borderTop: "1px solid #2a2a2e",
            fontSize: "11px",
            color: "#6b6b78",
            lineHeight: "1.5",
            maxHeight: "80px",
            overflowY: "auto",
            flexShrink: 0,
          })}
        >
          <span css={css({ color: "#a855f7", fontWeight: "600", marginRight: "6px" })}>
            Prompt:
          </span>
          {chosenStyle.restylePrompt}
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
            css={css({
              backgroundColor: "transparent",
              border: "1px solid #2a2a2e",
              borderRadius: "6px",
              padding: "6px 14px",
              color: "#a0a0aa",
              fontSize: "12px",
              cursor: "pointer",
              ":hover": { color: "#e8e8ec", borderColor: "#3a3a3e" },
            })}
          >
            Close
          </button>

          <div css={css({ display: "flex", gap: "8px" })}>
            {restyledImage && (
              <button
                onClick={handleDownload}
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  backgroundColor: "#1e1e22",
                  border: "1px solid #2a2a2e",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  color: "#e8e8ec",
                  fontSize: "12px",
                  cursor: "pointer",
                  ":hover": { backgroundColor: "#2a2a2e" },
                })}
              >
                <Download size={12} /> Download PNG
              </button>
            )}

            <button
              onClick={() => runRestyle(chosenStyle)}
              disabled={loading || !originalImage}
              css={css({
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: loading
                  ? "#2a1a3a"
                  : "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
                border: "none",
                borderRadius: "6px",
                padding: "6px 16px",
                color: "#fff",
                fontSize: "12px",
                fontWeight: "600",
                cursor: loading || !originalImage ? "not-allowed" : "pointer",
                opacity: !originalImage ? 0.5 : 1,
                boxShadow: loading ? "none" : "0 2px 12px rgba(168,85,247,0.4)",
                transition: "0.15s",
                ":hover:not(:disabled)": {
                  boxShadow: "0 4px 18px rgba(168,85,247,0.6)",
                },
              })}
            >
              {loading ? (
                <Loader2 size={12} css={css({ animation: `${spin} 1s linear infinite` })} />
              ) : restyledImage ? (
                <RefreshCw size={12} />
              ) : (
                <Sparkles size={12} />
              )}
              {loading ? "Generating..." : restyledImage ? "Regenerate" : "Restyle"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
