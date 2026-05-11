import { useAreaStore } from "@/state/areaStore";
import { css, keyframes } from "@emotion/react";
import { Loader2, CheckCircle } from "lucide-react";
import React, { useState } from "react";
import { useProjectStore } from "@/state/projectStore";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

// Public Overpass mirrors. The official endpoint is rate-limited and
// occasionally drops requests with a network-layer error; fall through to
// the community mirrors so a single bad host doesn't kill the feature.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

async function fetchOverpassWithFallback(query: string): Promise<any> {
  let lastErr: unknown;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      console.log("[BuildingHeights] trying", url);
      const r = await fetch(url, {
        method: "POST",
        body: query,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return await r.json();
    } catch (err) {
      console.warn(`[BuildingHeights] ${url} failed:`, err);
      lastErr = err;
    }
  }
  throw new Error(
    `All Overpass mirrors failed. Last error: ${(lastErr as Error)?.message || lastErr}`
  );
}

export function BuildingHeights({ area }: { area: any }) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appendAreas = useAreaStore((state) => state.appendAreas);
  const markDirty = useProjectStore((state) => state.markDirty);

  // Accepts either [LatLng, LatLng] from the map's draw-selector or
  // [{lat,lng}, {lat,lng}] from LocationSearch. Just needs two points with
  // numeric lat/lng. If either is missing/invalid, surface a visible reason
  // instead of looking like the button is dead.
  const validArea =
    Array.isArray(area) &&
    area.length >= 2 &&
    area[0] != null &&
    area[1] != null &&
    typeof area[0].lat === "number" &&
    typeof area[0].lng === "number" &&
    typeof area[1].lat === "number" &&
    typeof area[1].lng === "number";

  const requestBuildings = () => {
    console.log(
      "[BuildingHeights] click fired. area =", area,
      "validArea =", validArea
    );
    if (!validArea) {
      setError(
        "No valid area selected. Draw a rectangle on the map or use the search."
      );
      return;
    }
    setLoading(true);
    setDone(false);
    setError(null);

    // Normalize: bbox-safe regardless of which corner is in slot [0] vs [1].
    const south = Math.min(area[0].lat, area[1].lat);
    const north = Math.max(area[0].lat, area[1].lat);
    const west = Math.min(area[0].lng, area[1].lng);
    const east = Math.max(area[0].lng, area[1].lng);
    const query = `[out:json][timeout:25];(way["building"](${south},${west},${north},${east});relation["building"](${south},${west},${north},${east}););out body geom;`;

    console.log("[BuildingHeights] fetching bbox", { south, west, north, east });

    fetchOverpassWithFallback(query)
      .then((data) => {
        const blds = data.elements.map((el: any) => ({
          id: el.id,
          tags: el.tags,
          geometry: el.geometry
            ? el.geometry.map((pt: any) => ({ lat: pt.lat, lng: pt.lon }))
            : undefined,
        }));
        appendAreas(blds);
        setCount(blds.length);
        setDone(true);
        markDirty();
      })
      .catch((err) => {
        console.error("[BuildingHeights] fetch failed:", err);
        setError(err.message || "Failed to fetch buildings");
      })
      .finally(() => setLoading(false));
  };

  return (
    <div css={css({ display: "flex", flexDirection: "column", gap: "0.75rem" })}>
      <button
        css={css({
          color: "#fff",
          backgroundColor: "#3b82f6",
          border: "none",
          padding: "0.6rem 1rem",
          borderRadius: "8px",
          cursor: loading ? "wait" : "pointer",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "0.15s",
          ":hover": { backgroundColor: "#2563eb" },
          ":disabled": { opacity: 0.5, cursor: "not-allowed" },
        })}
        onClick={requestBuildings}
        disabled={loading}
      >
        {loading && (
          <Loader2
            css={css({ animation: `${spin} 1s linear infinite` })}
            size={14}
          />
        )}
        {loading ? "Fetching..." : "Fetch Buildings"}
      </button>

      {done && (
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: "#22c55e",
            fontSize: "12px",
          })}
        >
          <CheckCircle size={13} />
          {count} buildings loaded — ready to view in 3D
        </div>
      )}

      {error && (
        <div
          css={css({
            color: "#f87171",
            fontSize: "11px",
            backgroundColor: "#2a1414",
            border: "1px solid #4a1818",
            borderRadius: "5px",
            padding: "6px 8px",
            lineHeight: "1.4",
          })}
        >
          {error}
        </div>
      )}
    </div>
  );
}
