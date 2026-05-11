import { useContext, useEffect, useMemo } from "react";
import {
  TilesRenderer,
  TilesPlugin,
  EastNorthUpFrame,
  TilesAttributionOverlay,
  TilesRendererContext,
} from "3d-tiles-renderer/r3f";
import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/plugins";
import { tilesRendererRef } from "@/utils/tilesRendererRef";

const GOOGLE_KEY: string | undefined =
  typeof import.meta !== "undefined"
    ? (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY
    : undefined;

interface PhotorealTilesProps {
  /** Reference center as [NE, SW] from areaStore.center */
  center: { lat: number; lng: number }[];
  /** Tiles error target — lower = higher quality, slower. Default 20. */
  errorTarget?: number;
}

/**
 * Loads Google's Photorealistic 3D Tiles for the scene's reference lat/lng,
 * placed at the scene origin via EastNorthUpFrame.
 *
 * The mesh content is real photogrammetry of the area (buildings, terrain,
 * vegetation). Streaming is handled by the underlying TilesRenderer.
 *
 * Per Google TOS: a "© Google" attribution + per-tile data attribution must
 * be displayed when this is active. See <PhotorealAttributionOverlay />.
 */
export function PhotorealTiles({ center, errorTarget = 20 }: PhotorealTilesProps) {
  if (!GOOGLE_KEY) return null;
  if (!center || center.length < 2) return null;

  // Reference point: bbox center.
  const refLat = useMemo(() => (center[0].lat + center[1].lat) / 2, [center]);
  const refLng = useMemo(() => (center[0].lng + center[1].lng) / 2, [center]);

  return (
    // EastNorthUpFrame pins the photogrammetry mesh so this lat/lng/altitude
    // sits at the local origin, with +X east, +Y up, +Z south. Our scene's
    // OSM buildings already use a similar convention so they overlay roughly.
    <EastNorthUpFrame lat={refLat * (Math.PI / 180)} lon={refLng * (Math.PI / 180)} height={0}>
      <TilesRenderer key={`${refLat}_${refLng}`} errorTarget={errorTarget}>
        <TilesPlugin
          plugin={GoogleCloudAuthPlugin}
          args={{ apiToken: GOOGLE_KEY, autoRefreshToken: true }}
        />
        {/* Per-tile data attribution chip ("Maxar", "Airbus", etc.) — required by Google TOS */}
        <TilesAttributionOverlay
          style={{
            position: "absolute",
            bottom: "8px",
            left: "12px",
            fontSize: "10px",
            color: "#a0a0aa",
            backgroundColor: "rgba(15,15,17,0.6)",
            backdropFilter: "blur(4px)",
            padding: "3px 8px",
            borderRadius: "4px",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 5,
            maxWidth: "calc(100% - 200px)",
          }}
        />
        {/* Publishes the underlying TilesRenderer to a module-level ref so
            autoPaintBuildings can listen for 'tiles-load-end' from outside
            the Canvas. */}
        <TilesRendererRefBridge />
      </TilesRenderer>
    </EastNorthUpFrame>
  );
}

/**
 * Lives inside <TilesRenderer>. Reads the underlying TilesRenderer instance
 * via context and publishes it to the module-singleton tilesRendererRef so
 * code outside the Canvas (autoPaintBuildings) can attach event listeners.
 */
function TilesRendererRefBridge() {
  const tiles = useContext(TilesRendererContext);
  useEffect(() => {
    tilesRendererRef.current = tiles ?? null;
    return () => {
      if (tilesRendererRef.current === tiles) {
        tilesRendererRef.current = null;
      }
    };
  }, [tiles]);
  return null;
}
