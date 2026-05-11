import { useEffect, useState, useMemo, useRef } from "react";
import * as THREE from "three";
import { fetchGroundImagery, BBox, getActiveProviderId } from "@/utils/tileProvider";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";

const PROJ_SCALE = 51000;
const FETCH_DEBOUNCE_MS = 350;

interface SatelliteGroundProps {
  center: { lat: number; lng: number }[];
  opacity?: number;
  yOffset?: number;
}

/**
 * Renders a textured plane sized to the user's selected bbox, sourced from
 * the active imagery provider (Google Static Maps if key set, else Esri).
 *
 * Fetches are debounced so the provider isn't hammered during box-draw.
 * On every fetch, the previous texture is kept visible until the new one
 * arrives, avoiding a flicker.
 */
export function SatelliteGround({
  center,
  opacity = 1.0,
  yOffset = 0.0,
}: SatelliteGroundProps) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [paintedTexture, setPaintedTexture] = useState<THREE.Texture | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerLabel, setProviderLabel] = useState<string>(getActiveProviderId());
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  // Subscribe to AI-painted ground override from paintedSceneStore.
  const paintedDataUrl = usePaintedSceneStore((s) => s.groundTexture);

  const bbox: BBox | null = useMemo(() => {
    if (!center || center.length < 2) return null;
    const a = center[0];
    const b = center[1];
    return {
      north: Math.max(a.lat, b.lat),
      south: Math.min(a.lat, b.lat),
      east: Math.max(a.lng, b.lng),
      west: Math.min(a.lng, b.lng),
    };
  }, [center]);

  const planeSize = useMemo(() => {
    if (!bbox) return null;
    const refLat = (bbox.north + bbox.south) / 2;
    const widthM =
      (bbox.east - bbox.west) * PROJ_SCALE * Math.cos((refLat * Math.PI) / 180);
    const heightM = (bbox.north - bbox.south) * PROJ_SCALE;
    return { width: widthM, height: heightM };
  }, [bbox]);

  // Debounced fetch
  useEffect(() => {
    if (!bbox) return;
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      const myReqId = ++reqIdRef.current;
      setLoading(true);
      setError(null);

      console.log(
        `[SatelliteGround] fetching bbox N=${bbox.north.toFixed(4)} S=${bbox.south.toFixed(4)} E=${bbox.east.toFixed(4)} W=${bbox.west.toFixed(4)}`
      );

      fetchGroundImagery(bbox)
        .then((result) => {
          if (myReqId !== reqIdRef.current) return; // outdated response
          console.log(
            `[SatelliteGround] loaded via ${result.provider}, ${result.size}px (${result.attribution})`
          );
          const tex = new THREE.CanvasTexture(
            result.image instanceof HTMLCanvasElement
              ? result.image
              : imageToCanvas(result.image)
          );
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = 8;
          tex.needsUpdate = true;

          // Dispose previous texture to avoid GPU mem leak
          setTexture((prev) => {
            prev?.dispose();
            return tex;
          });
          setProviderLabel(result.provider);
        })
        .catch((err) => {
          if (myReqId !== reqIdRef.current) return;
          console.error("[SatelliteGround] fetch failed:", err);
          setError(String(err));
        })
        .finally(() => {
          if (myReqId !== reqIdRef.current) return;
          setLoading(false);
        });
    }, FETCH_DEBOUNCE_MS) as unknown as number;

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [bbox?.north, bbox?.south, bbox?.east, bbox?.west]);

  // Load painted texture when paintedDataUrl changes
  useEffect(() => {
    if (!paintedDataUrl) {
      setPaintedTexture((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      setPaintedTexture((prev) => {
        prev?.dispose();
        return tex;
      });
    };
    img.src = paintedDataUrl;
  }, [paintedDataUrl]);

  if (!planeSize || !bbox) return null;

  // Painted ground takes precedence over raw satellite
  const activeTexture = paintedTexture ?? texture;

  return (
    <>
      {/* Ground plane — uses painted AI texture when available, else satellite.
          Lit material so SunLight + SkyLight from <AtmosphericRig> tint the
          imagery and sun shadows from buildings actually land on the ground.
          `roughness: 1, metalness: 0` keeps it fully diffuse (no glossy
          highlights on a photographic plate). Legacy (non-atmospheric)
          ambient + directional lighting also affects it but mildly, which is
          desired so the ground reads as part of the lit scene. */}
      {activeTexture && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, yOffset, 0]}
          renderOrder={-1}
          receiveShadow
        >
          <planeGeometry args={[planeSize.width, planeSize.height]} />
          <meshStandardMaterial
            map={activeTexture}
            roughness={1}
            metalness={0}
            transparent={opacity < 1}
            opacity={opacity}
          />
        </mesh>
      )}

      {/* Fallback dim plane while no texture has resolved yet (sized to bbox) */}
      {!activeTexture && !error && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, yOffset - 0.01, 0]}>
          <planeGeometry args={[planeSize.width, planeSize.height]} />
          <meshStandardMaterial color="#1a1a20" roughness={1} metalness={0} />
        </mesh>
      )}

      {/* Error fallback (sized to bbox) */}
      {error && !activeTexture && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, yOffset - 0.01, 0]}>
          <planeGeometry args={[planeSize.width, planeSize.height]} />
          <meshStandardMaterial color="#2a1212" roughness={1} metalness={0} />
        </mesh>
      )}
    </>
  );
}

function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------
// Standalone diagnostic overlay (rendered outside the Canvas)
// ---------------------------------------------------------------------------

import { useRenderModeStore } from "@/state/renderModeStore";

export function ProviderAttribution() {
  const renderMode = useRenderModeStore((s) => s.mode);
  const [imageryAttribution, setImageryAttribution] = useState("");

  useEffect(() => {
    const provider = getActiveProviderId();
    setImageryAttribution(
      provider === "google" ? "© Google" : "© Esri, Maxar, Earthstar Geographics"
    );
  }, []);

  // In photoreal/hybrid modes, the per-tile data attributions are rendered by
  // <TilesAttributionOverlay> inside PhotorealTiles. We always show the
  // top-level "© Google" badge when Google data is in use.
  const showGoogleBadge =
    renderMode === "photoreal" || renderMode === "hybrid" || imageryAttribution === "© Google";

  if (renderMode !== "osm") {
    return (
      <div
        style={{
          position: "absolute",
          bottom: "8px",
          right: "12px",
          fontSize: "10px",
          color: "#a0a0aa",
          backgroundColor: "rgba(15,15,17,0.6)",
          backdropFilter: "blur(4px)",
          padding: "3px 8px",
          borderRadius: "4px",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 5,
        }}
      >
        © Google
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: "8px",
        right: "12px",
        fontSize: "10px",
        color: "#a0a0aa",
        backgroundColor: "rgba(15,15,17,0.6)",
        backdropFilter: "blur(4px)",
        padding: "3px 8px",
        borderRadius: "4px",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 5,
      }}
    >
      {imageryAttribution}
    </div>
  );
}
