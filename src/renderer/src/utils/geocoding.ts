// Forward geocoding via Google Geocoding API.
//
// Input: a free-text place query (e.g. "Times Square", "Hell's Kitchen NYC").
// Output: a list of candidate locations with a center lat/lng + a viewport
// bbox suitable for direct use as our scene area selection.

const GOOGLE_KEY: string | undefined =
  typeof import.meta !== "undefined"
    ? (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY
    : undefined;

export interface GeocodeResult {
  formattedAddress: string;
  center: { lat: number; lng: number };
  /** Bounding box from Google's "viewport" (recommended display area). */
  viewport: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  /** Place type tags (e.g. "neighborhood", "point_of_interest"). */
  types: string[];
}

/**
 * Forward geocode a free-text query.
 * Returns up to 5 candidate matches.
 */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  if (!GOOGLE_KEY) {
    throw new Error("Google Maps API key not configured");
  }
  if (!query.trim()) return [];

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?` +
    `address=${encodeURIComponent(query)}&key=${GOOGLE_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const data = await res.json();

  if (data.status === "ZERO_RESULTS") return [];
  if (data.status !== "OK") {
    throw new Error(`Geocoding ${data.status}: ${data.error_message ?? ""}`);
  }

  return (data.results || []).slice(0, 5).map((r: any) => ({
    formattedAddress: r.formatted_address,
    center: {
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    },
    viewport: {
      north: r.geometry.viewport.northeast.lat,
      south: r.geometry.viewport.southwest.lat,
      east: r.geometry.viewport.northeast.lng,
      west: r.geometry.viewport.southwest.lng,
    },
    types: r.types || [],
  }));
}

/**
 * Convert a viewport (or an arbitrary lat/lng) into the [NE, SW] tuple format
 * the rest of the app uses for its area selection.
 *
 * If the viewport is too large (e.g. an entire city), shrink it around the
 * center to a sensible scout area (~1km square).
 */
export function geocodeToAreaTuple(result: GeocodeResult): { lat: number; lng: number }[] {
  const { center, viewport } = result;
  const lngSpan = viewport.east - viewport.west;
  const latSpan = viewport.north - viewport.south;

  const MAX_SPAN = 0.012; // ~1.3km at NYC latitude

  if (lngSpan > MAX_SPAN || latSpan > MAX_SPAN) {
    const half = MAX_SPAN / 2;
    return [
      { lat: center.lat + half, lng: center.lng + half },
      { lat: center.lat - half, lng: center.lng - half },
    ];
  }

  return [
    { lat: viewport.north, lng: viewport.east },
    { lat: viewport.south, lng: viewport.west },
  ];
}
