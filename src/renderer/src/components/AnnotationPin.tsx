import React, { useState } from "react";
import { Html } from "@react-three/drei";
import { AnnotationPin as PinData, useAnnotationStore } from "@/state/annotationStore";
import { useCameraStore, fovToFocalLength } from "@/state/cameraStore";
import { useCarStore } from "@/state/carStore";
import { MapPin, X, Camera } from "lucide-react";

const PIN_LABEL: Record<string, string> = {
  shot: "Shot",
  location: "Location",
  note: "Note",
  hazard: "Hazard",
};

export function AnnotationPin({ pin }: { pin: PinData }) {
  const [expanded, setExpanded] = useState(false);
  const selectPin = useAnnotationStore((s) => s.selectPin);
  const selectedPinId = useAnnotationStore((s) => s.selectedPinId);
  const removePin = useAnnotationStore((s) => s.removePin);
  const requestFraming = useCameraStore((s) => s.requestFraming);
  const setThirdMode = useCarStore((s) => s.setThirdMode);
  const isSelected = selectedPinId === pin.id;

  const handleFrameShot = () => {
    if (!pin.camera) return;
    setThirdMode(false); // exit drive mode if active
    requestFraming(pin.camera);
  };

  return (
    <Html
      position={[pin.position.x, pin.position.y + 0.5, pin.position.z]}
      center
      zIndexRange={[100, 0]}
      // Don't include Html in GLB export
      userData={{ skipExport: true }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={(e) => {
          e.stopPropagation();
          selectPin(isSelected ? null : pin.id);
          setExpanded(!expanded || !isSelected);
        }}
      >
        {/* Pin bubble */}
        <div
          style={{
            backgroundColor: pin.color,
            border: isSelected ? "2px solid #fff" : "2px solid transparent",
            borderRadius: "50%",
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 2px 12px ${pin.color}88`,
            transition: "transform 0.15s",
            transform: isSelected ? "scale(1.25)" : "scale(1)",
          }}
        >
          <MapPin size={14} color="#fff" />
        </div>

        {/* Stem */}
        <div
          style={{
            width: "2px",
            height: "12px",
            backgroundColor: pin.color,
            opacity: 0.7,
          }}
        />

        {/* Label */}
        <div
          style={{
            backgroundColor: "#1e1e22ee",
            backdropFilter: "blur(8px)",
            border: `1px solid ${pin.color}66`,
            borderRadius: "6px",
            padding: "2px 8px",
            fontSize: "11px",
            fontWeight: "600",
            color: "#e8e8ec",
            whiteSpace: "nowrap",
            maxWidth: "140px",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {pin.name || PIN_LABEL[pin.type]}
        </div>

        {/* Expanded details card */}
        {(expanded || isSelected) && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginTop: "6px",
              backgroundColor: "#1e1e22f0",
              backdropFilter: "blur(12px)",
              border: `1px solid ${pin.color}55`,
              borderRadius: "10px",
              padding: "10px 12px",
              width: "200px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
              zIndex: 10,
              color: "#e8e8ec",
              fontSize: "12px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "6px",
              }}
            >
              <div>
                <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "2px" }}>
                  {pin.name || PIN_LABEL[pin.type]}
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: pin.color,
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {PIN_LABEL[pin.type]}
                </div>
              </div>
              <button
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#6b6b78",
                  padding: "0",
                  display: "flex",
                }}
                onClick={() => removePin(pin.id)}
                title="Remove pin"
              >
                <X size={13} />
              </button>
            </div>

            {pin.description && (
              <div
                style={{
                  color: "#a0a0aa",
                  fontSize: "11px",
                  lineHeight: "1.5",
                  borderTop: "1px solid #2a2a2e",
                  paddingTop: "6px",
                  marginTop: "4px",
                }}
              >
                {pin.description}
              </div>
            )}

            {pin.camera && (
              <button
                onClick={handleFrameShot}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                  width: "100%",
                  marginTop: "8px",
                  backgroundColor: "#3b82f6",
                  border: "none",
                  borderRadius: "6px",
                  padding: "5px 10px",
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#3b82f6")}
              >
                <Camera size={11} />
                Frame this shot
                <span style={{ color: "#bcd5ff", fontSize: "10px", fontFamily: "monospace" }}>
                  {Math.round(fovToFocalLength(pin.camera.fov))}mm
                </span>
              </button>
            )}

            {pin.tags.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px",
                  marginTop: "8px",
                }}
              >
                {pin.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      backgroundColor: "#2a2a2e",
                      color: "#a0a0aa",
                      borderRadius: "4px",
                      padding: "1px 6px",
                      fontSize: "10px",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Html>
  );
}
