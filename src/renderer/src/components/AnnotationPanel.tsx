import React, { useState } from "react";
import { css } from "@emotion/react";
import {
  AnnotationPin,
  PinType,
  PIN_TYPE_COLORS,
  useAnnotationStore,
} from "@/state/annotationStore";
import {
  MapPin,
  Film,
  Lightbulb,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  X,
  Camera,
} from "lucide-react";
import { useCameraStore, fovToFocalLength } from "@/state/cameraStore";
import { useCarStore } from "@/state/carStore";

const PIN_ICONS: Record<PinType, React.ReactNode> = {
  shot: <Film size={12} />,
  location: <MapPin size={12} />,
  note: <Lightbulb size={12} />,
  hazard: <AlertTriangle size={12} />,
};

const PIN_LABELS: Record<PinType, string> = {
  shot: "Shot",
  location: "Location",
  note: "Note",
  hazard: "Hazard",
};

function PinRow({ pin }: { pin: AnnotationPin }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pin.name);
  const [desc, setDesc] = useState(pin.description);
  const [tags, setTags] = useState(pin.tags.join(", "));
  const [type, setType] = useState<PinType>(pin.type);

  const selectedPinId = useAnnotationStore((s) => s.selectedPinId);
  const selectPin = useAnnotationStore((s) => s.selectPin);
  const updatePin = useAnnotationStore((s) => s.updatePin);
  const removePin = useAnnotationStore((s) => s.removePin);
  const requestFraming = useCameraStore((s) => s.requestFraming);
  const setThirdMode = useCarStore((s) => s.setThirdMode);

  const isSelected = selectedPinId === pin.id;

  const frameShot = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pin.camera) return;
    setThirdMode(false);
    requestFraming(pin.camera);
  };

  const save = () => {
    updatePin(pin.id, {
      name,
      description: desc,
      type,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setEditing(false);
  };

  return (
    <div
      css={css({
        borderRadius: "8px",
        border: `1px solid ${isSelected ? PIN_TYPE_COLORS[pin.type] + "88" : "#2a2a2e"}`,
        backgroundColor: isSelected ? "#22222688" : "transparent",
        overflow: "hidden",
        transition: "border-color 0.15s",
        marginBottom: "6px",
      })}
    >
      {/* Row header */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 10px",
          cursor: "pointer",
          ":hover": { backgroundColor: "#1e1e22" },
        })}
        onClick={() => selectPin(isSelected ? null : pin.id)}
      >
        <div
          css={css({
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: PIN_TYPE_COLORS[pin.type],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "#fff",
          })}
        >
          {PIN_ICONS[pin.type]}
        </div>

        <div css={css({ flex: 1, minWidth: 0 })}>
          <div
            css={css({
              fontSize: "12px",
              fontWeight: "600",
              color: "#e8e8ec",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            {pin.name || PIN_LABELS[pin.type]}
          </div>
          <div css={css({ fontSize: "10px", color: "#6b6b78", display: "flex", gap: "6px" })}>
            <span>{PIN_LABELS[pin.type]}</span>
            {pin.camera && (
              <span css={css({ color: "#3b82f6", fontFamily: "monospace" })}>
                {Math.round(fovToFocalLength(pin.camera.fov))}mm
              </span>
            )}
          </div>
        </div>

        <div css={css({ display: "flex", gap: "4px", flexShrink: 0 })}>
          {pin.camera && (
            <button
              css={css({
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#3b82f6",
                padding: "2px",
                display: "flex",
                ":hover": { color: "#60a5fa" },
              })}
              onClick={frameShot}
              title="Frame this shot"
            >
              <Camera size={12} />
            </button>
          )}
          <button
            css={css({
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#6b6b78",
              padding: "2px",
              display: "flex",
              ":hover": { color: "#e8e8ec" },
            })}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(!editing);
            }}
            title="Edit"
          >
            {editing ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button
            css={css({
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#6b6b78",
              padding: "2px",
              display: "flex",
              ":hover": { color: "#ef4444" },
            })}
            onClick={(e) => {
              e.stopPropagation();
              removePin(pin.id);
            }}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Inline editor */}
      {editing && (
        <div
          css={css({
            padding: "10px",
            borderTop: "1px solid #2a2a2e",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          })}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            css={css({
              width: "100%",
              backgroundColor: "#0f0f11",
              border: "1px solid #2a2a2e",
              borderRadius: "6px",
              padding: "5px 8px",
              color: "#e8e8ec",
              fontSize: "12px",
              outline: "none",
              ":focus": { borderColor: "#3b82f6" },
            })}
            placeholder="Pin name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <select
            css={css({
              width: "100%",
              backgroundColor: "#0f0f11",
              border: "1px solid #2a2a2e",
              borderRadius: "6px",
              padding: "5px 8px",
              color: "#e8e8ec",
              fontSize: "12px",
              outline: "none",
            })}
            value={type}
            onChange={(e) => setType(e.target.value as PinType)}
          >
            <option value="shot">Shot</option>
            <option value="location">Location</option>
            <option value="note">Note</option>
            <option value="hazard">Hazard</option>
          </select>

          <textarea
            css={css({
              width: "100%",
              backgroundColor: "#0f0f11",
              border: "1px solid #2a2a2e",
              borderRadius: "6px",
              padding: "5px 8px",
              color: "#e8e8ec",
              fontSize: "12px",
              resize: "vertical",
              minHeight: "60px",
              outline: "none",
              fontFamily: "inherit",
              ":focus": { borderColor: "#3b82f6" },
            })}
            placeholder="Description..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />

          <input
            css={css({
              width: "100%",
              backgroundColor: "#0f0f11",
              border: "1px solid #2a2a2e",
              borderRadius: "6px",
              padding: "5px 8px",
              color: "#e8e8ec",
              fontSize: "12px",
              outline: "none",
              ":focus": { borderColor: "#3b82f6" },
            })}
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />

          <div css={css({ display: "flex", gap: "6px" })}>
            <button
              css={css({
                flex: 1,
                backgroundColor: "#3b82f6",
                border: "none",
                borderRadius: "6px",
                padding: "5px",
                color: "#fff",
                fontSize: "11px",
                cursor: "pointer",
                ":hover": { backgroundColor: "#2563eb" },
              })}
              onClick={save}
            >
              Save
            </button>
            <button
              css={css({
                flex: 1,
                backgroundColor: "#2a2a2e",
                border: "none",
                borderRadius: "6px",
                padding: "5px",
                color: "#a0a0aa",
                fontSize: "11px",
                cursor: "pointer",
              })}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface AnnotationPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onRequestPin: (type: PinType) => void;
}

export function AnnotationPanel({
  isOpen,
  onToggle,
  onRequestPin,
}: AnnotationPanelProps) {
  const pins = useAnnotationStore((s) => s.pins);
  const clearPins = useAnnotationStore((s) => s.clearPins);
  const [addingType, setAddingType] = useState<PinType | null>(null);

  const pinTypes: PinType[] = ["shot", "location", "note", "hazard"];

  const handleAddClick = (type: PinType) => {
    setAddingType(type);
    onRequestPin(type);
  };

  return (
    <div
      css={css({
        width: isOpen ? "260px" : "0",
        flexShrink: 0,
        transition: "width 0.25s ease",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid #2a2a2e",
        backgroundColor: "#17171a",
      })}
    >
      <div css={css({ width: "260px", height: "100%", display: "flex", flexDirection: "column" })}>
        {/* Header */}
        <div
          css={css({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 14px",
            borderBottom: "1px solid #2a2a2e",
            flexShrink: 0,
          })}
        >
          <div css={css({ display: "flex", alignItems: "center", gap: "6px" })}>
            <MapPin size={13} color="#3b82f6" />
            <span css={css({ fontSize: "12px", fontWeight: "600", color: "#e8e8ec" })}>
              Annotations
            </span>
            <span
              css={css({
                backgroundColor: "#2a2a2e",
                borderRadius: "999px",
                padding: "1px 7px",
                fontSize: "10px",
                color: "#a0a0aa",
              })}
            >
              {pins.length}
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
            <X size={14} />
          </button>
        </div>

        {/* Add pin buttons */}
        <div
          css={css({
            padding: "10px 12px",
            borderBottom: "1px solid #2a2a2e",
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
            flexShrink: 0,
          })}
        >
          {pinTypes.map((type) => (
            <button
              key={type}
              css={css({
                display: "flex",
                alignItems: "center",
                gap: "4px",
                backgroundColor:
                  addingType === type ? PIN_TYPE_COLORS[type] : "#2a2a2e",
                border: `1px solid ${addingType === type ? PIN_TYPE_COLORS[type] : "#3a3a3e"}`,
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "10px",
                color: addingType === type ? "#fff" : "#a0a0aa",
                cursor: "pointer",
                transition: "0.15s",
                ":hover": {
                  backgroundColor: PIN_TYPE_COLORS[type] + "44",
                  color: "#e8e8ec",
                },
              })}
              onClick={() =>
                addingType === type
                  ? setAddingType(null)
                  : handleAddClick(type)
              }
              title={`Add ${PIN_LABELS[type]} pin — then click in the 3D scene`}
            >
              <Plus size={9} />
              {PIN_LABELS[type]}
            </button>
          ))}
        </div>

        {addingType && (
          <div
            css={css({
              margin: "8px 12px",
              padding: "8px",
              backgroundColor: "#0f0f11",
              border: `1px dashed ${PIN_TYPE_COLORS[addingType]}88`,
              borderRadius: "6px",
              fontSize: "11px",
              color: "#a0a0aa",
              flexShrink: 0,
            })}
          >
            Click anywhere in the 3D scene to place a{" "}
            <span style={{ color: PIN_TYPE_COLORS[addingType], fontWeight: 600 }}>
              {PIN_LABELS[addingType]}
            </span>{" "}
            pin. Press Esc to cancel.
          </div>
        )}

        {/* Pin list */}
        <div
          css={css({
            flex: 1,
            overflowY: "auto",
            padding: "8px 10px",
          })}
        >
          {pins.length === 0 ? (
            <div
              css={css({
                color: "#4a4a54",
                fontSize: "12px",
                textAlign: "center",
                marginTop: "32px",
                lineHeight: "1.6",
              })}
            >
              No pins yet.
              <br />
              Add a pin type above, then
              <br />
              click in the 3D scene.
            </div>
          ) : (
            pins.map((pin) => <PinRow key={pin.id} pin={pin} />)
          )}
        </div>

        {/* Footer */}
        {pins.length > 0 && (
          <div
            css={css({
              padding: "10px 12px",
              borderTop: "1px solid #2a2a2e",
              flexShrink: 0,
            })}
          >
            <button
              css={css({
                width: "100%",
                backgroundColor: "transparent",
                border: "1px solid #2a2a2e",
                borderRadius: "6px",
                padding: "5px",
                color: "#6b6b78",
                fontSize: "11px",
                cursor: "pointer",
                ":hover": { color: "#ef4444", borderColor: "#ef4444" },
              })}
              onClick={() => {
                if (confirm("Clear all pins?")) clearPins();
              }}
            >
              Clear All Pins
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Sidebar toggle tab (shown when panel is closed)
export function AnnotationToggleTab({ onClick }: { onClick: () => void }) {
  const pins = useAnnotationStore((s) => s.pins);
  return (
    <button
      css={css({
        position: "absolute",
        right: 0,
        top: "50%",
        transform: "translateY(-50%)",
        backgroundColor: "#17171a",
        border: "1px solid #2a2a2e",
        borderRight: "none",
        borderRadius: "6px 0 0 6px",
        padding: "10px 6px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        zIndex: 10,
        color: "#a0a0aa",
        ":hover": { color: "#e8e8ec", backgroundColor: "#1e1e22" },
      })}
      onClick={onClick}
      title="Toggle Annotations Panel"
    >
      <MapPin size={14} color="#3b82f6" />
      <span
        css={css({
          writingMode: "vertical-rl",
          fontSize: "10px",
          fontWeight: "600",
          letterSpacing: "0.05em",
        })}
      >
        Pins {pins.length > 0 ? `(${pins.length})` : ""}
      </span>
    </button>
  );
}
