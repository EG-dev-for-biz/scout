import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Rectangle,
  TileLayer,
  useMapEvents,
} from "react-leaflet";
import L, { LatLng, LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { css } from "@emotion/react";
import { CircleMinus, MousePointerClick, Layers } from "lucide-react";

const IconSize = css({ width: "14px", height: "14px" });

const GOOGLE_KEY: string | undefined =
  typeof import.meta !== "undefined"
    ? (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY
    : undefined;

type BasemapMode = "satellite" | "streets";

interface BasemapConfig {
  url: string;
  attribution: string;
  subdomains?: string[];
}

function getBasemap(mode: BasemapMode): BasemapConfig {
  if (mode === "satellite" && GOOGLE_KEY) {
    // Google satellite via legacy maps tile endpoint (not the new Tiles API,
    // which requires session tokens). This works directly with TileLayer.
    return {
      url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      attribution: "© Google",
      subdomains: ["0", "1", "2", "3"],
    };
  }
  // Streets fallback (always available — no key needed)
  return {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
    subdomains: ["a", "b", "c"],
  };
}

function RectangleSelector({
  isDrag,
  bounds: _bounds,
  drawBounds,
  onChange,
  onDrawChange,
}: {
  isDrag: boolean;
  bounds: LatLngBounds | null;
  drawBounds: LatLngBounds | null;
  onChange: (bounds: LatLngBounds) => void;
  onDrawChange: (bounds: LatLngBounds) => void;
}) {
  const [firstPoint, setFirstPoint] = useState<LatLng | null>(null);
  const lastLatlngRef = useRef<LatLng | null>(null);

  const adjustLng = (latlng: LatLng): LatLng => {
    const adjustedLng = ((((latlng.lng + 180) % 360) + 360) % 360) - 180;
    return new L.LatLng(latlng.lat, adjustedLng);
  };

  const map = useMapEvents({
    mousedown(e) {
      if (!isDrag) setFirstPoint(e.latlng);
    },
    mousemove(e) {
      if (firstPoint) {
        lastLatlngRef.current = adjustLng(e.latlng);
        onDrawChange(new L.LatLngBounds(firstPoint, e.latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPoint), adjustLng(e.latlng)));
      }
    },
    mouseup(e) {
      if (firstPoint) {
        onDrawChange(new L.LatLngBounds(firstPoint, e.latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPoint), adjustLng(e.latlng)));
        setFirstPoint(null);
      }
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    const handleTouchStart = (e: TouchEvent) => {
      if (!isDrag && e.touches.length > 0) {
        const latlng = map.mouseEventToLatLng(e.touches[0] as any);
        setFirstPoint(latlng);
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (firstPoint && e.touches.length > 0) {
        const latlng = map.mouseEventToLatLng(e.touches[0] as any);
        lastLatlngRef.current = latlng;
        onDrawChange(new L.LatLngBounds(firstPoint, latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPoint), adjustLng(latlng)));
      }
    };
    const handleTouchEnd = () => {
      if (firstPoint) {
        const latlng = lastLatlngRef.current || firstPoint;
        onDrawChange(new L.LatLngBounds(firstPoint, latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPoint), adjustLng(latlng)));
        setFirstPoint(null);
      }
    };
    container.addEventListener("touchstart", handleTouchStart);
    container.addEventListener("touchmove", handleTouchMove);
    container.addEventListener("touchend", handleTouchEnd);
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [map, isDrag, firstPoint, onChange]);

  useEffect(() => {
    if (map) isDrag ? map.dragging.enable() : map.dragging.disable();
  }, [isDrag, map]);

  return drawBounds ? (
    <Rectangle bounds={drawBounds} pathOptions={{ color: "#3b82f6", weight: 2 }} />
  ) : null;
}

/** Watches `flyToBounds` prop and pans the Leaflet map there when it changes. */
function MapBoundsController({
  bounds,
}: {
  bounds: LatLngBounds | null;
}) {
  const map = useMapEvents({});
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20], animate: true });
    }
  }, [bounds, map]);
  return null;
}

export function MapComponent({
  onDone,
  onRemove,
  flyToBounds,
  prefilledBounds,
}: {
  onDone: (e: any) => void;
  onRemove: () => void;
  /** When set, the Leaflet map flies to this bbox. */
  flyToBounds?: LatLngBounds | null;
  /** When set, treats this as the active selection (e.g. from a search). */
  prefilledBounds?: LatLngBounds | null;
}) {
  const [isDrag, setIsDrag] = useState(true);
  const [bounds, setBounds] = useState<LatLngBounds | null>(prefilledBounds ?? null);
  const [drawBounds, setDrawBounds] = useState<LatLngBounds | null>(
    prefilledBounds ?? null
  );
  const [basemapMode, setBasemapMode] = useState<BasemapMode>(
    GOOGLE_KEY ? "satellite" : "streets"
  );

  // Sync external bbox (e.g. set by search) into local state
  useEffect(() => {
    if (prefilledBounds) {
      setBounds(prefilledBounds);
      setDrawBounds(prefilledBounds);
    }
  }, [prefilledBounds]);

  const basemap = getBasemap(basemapMode);

  return (
    <div css={css({ position: "relative", flex: 1 })}>
      <div
        css={css({
          position: "absolute",
          zIndex: 9999,
          right: "0.75rem",
          top: "0.75rem",
          display: "flex",
          gap: "0.5rem",
        })}
      >
        {bounds && !isDrag && (
          <button
            css={css({
              color: "#fff",
              backgroundColor: "#ef4444",
              border: "none",
              padding: "0.4rem 0.8rem",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            })}
            onClick={() => {
              onRemove();
              setBounds(null);
              setDrawBounds(null);
              setIsDrag(true);
            }}
          >
            <CircleMinus css={IconSize} /> Clear
          </button>
        )}

        {/* Basemap toggle */}
        <button
          css={css({
            color: "#e8e8ec",
            backgroundColor: "#2a2a2e",
            border: "1px solid #3a3a3e",
            padding: "0.4rem 0.6rem",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "11px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          })}
          onClick={() =>
            setBasemapMode(basemapMode === "satellite" ? "streets" : "satellite")
          }
          title="Toggle basemap"
        >
          <Layers css={IconSize} />
          {basemapMode === "satellite" ? "Sat" : "Map"}
        </button>

        <button
          css={css({
            color: isDrag ? "#fff" : "#e8e8ec",
            backgroundColor: isDrag ? "#3b82f6" : "#2a2a2e",
            border: "1px solid #3a3a3e",
            padding: "0.4rem 0.8rem",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          })}
          onClick={() => setIsDrag(!isDrag)}
        >
          {isDrag ? (
            <>
              <MousePointerClick css={IconSize} /> Select Area
            </>
          ) : (
            "Back to Pan"
          )}
        </button>
      </div>

      <MapContainer
        center={[40.8, -73.95]}
        zoom={13}
        style={{ height: "100%", width: "100%", minHeight: "300px" }}
      >
        <TileLayer
          key={basemapMode}
          attribution={basemap.attribution}
          url={basemap.url}
          subdomains={basemap.subdomains}
        />
        <MapBoundsController bounds={flyToBounds ?? null} />
        <RectangleSelector
          bounds={bounds}
          drawBounds={drawBounds}
          isDrag={isDrag}
          onChange={(b) => {
            setBounds(b);
            onDone([b._northEast, b._southWest]);
          }}
          onDrawChange={(b) => {
            setDrawBounds(b);
            onDone([b._northEast, b._southWest]);
          }}
        />
      </MapContainer>
    </div>
  );
}
