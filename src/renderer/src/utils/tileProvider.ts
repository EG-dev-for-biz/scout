// Imagery provider abstraction.
//
// Two modes:
//   1. Single-image bbox fetch (Google Static Maps) — preferred when key
//      is available. One HTTP request returns a fully-stitched satellite
//      image of the bbox, ready to texture-map.
//   2. Tile stitching (Esri World Imagery, OSM) — fallback when no key.
//      Fetches z/x/y tiles and composes them onto a canvas.
//
// All consumers should call `fetchGroundImagery(bbox)` and not care which
// path was taken.

const GOOGLE_KEY: string | undefined =
  typeof import.meta !== "undefined"
    ? (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY
    : undefined;

export type ProviderId = "google" | "esri" | "osm";

export interface ImageryResult {
  /** Provider that actually returned the image. */
  provider: ProviderId;
  /** Square pixel dimensions of the resulting texture. */
  size: number;
  /** Data URL or canvas-backed image element ready for THREE.Texture. */
  image: HTMLCanvasElement | HTMLImageElement;
  /** Attribution string to display on the scene. */
  attribution: string;
}

export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches a stitched satellite image covering `bbox`. Picks the best
 * provider based on whether a Google key is configured.
 */
export async function fetchGroundImagery(bbox: BBox): Promise<ImageryResult> {
  if (GOOGLE_KEY) {
    try {
      return await fetchGoogleStaticMap(bbox, GOOGLE_KEY);
    } catch (err) {
      console.warn("[tileProvider] Google Static Maps failed, falling back:", err);
    }
  }
  return fetchEsriStitched(bbox);
}

/** Returns the best provider name for UI display, before fetching. */
export function getActiveProviderId(): ProviderId {
  return GOOGLE_KEY ? "google" : "esri";
}

// ---------------------------------------------------------------------------
// Google Static Maps (single fetch)
// ---------------------------------------------------------------------------

async function fetchGoogleStaticMap(bbox: BBox, key: string): Promise<ImageryResult> {
  const centerLat = (bbox.north + bbox.south) / 2;
  const centerLng = (bbox.east + bbox.west) / 2;
  const zoom = pickStaticMapZoom(bbox);

  // Google caps free Static Maps at 640×640; with scale=2 actual pixel data
  // is 1280×1280 covering the same ground area at higher resolution.
  const size = 640;
  const scale = 2;
  const url =
    `https://maps.googleapis.com/maps/api/staticmap?` +
    `center=${centerLat},${centerLng}` +
    `&zoom=${zoom}` +
    `&size=${size}x${size}` +
    `&scale=${scale}` +
    `&maptype=satellite` +
    `&key=${key}`;

  const img = await loadImage(url);

  // Crop the returned image to exactly the user's bbox using Web Mercator
  // pixel coordinates. The raw image covers a square in WM space, but the
  // user's bbox at high latitude is rectangular in WM. Without this crop,
  // the painted texture is offset/skewed relative to the OSM building grid.
  const cropped = cropImageToBbox(img, bbox, centerLat, centerLng, zoom, size, scale);

  return {
    provider: "google",
    size: Math.max(cropped.width, cropped.height),
    image: cropped,
    attribution: "© Google",
  };
}

/**
 * Given a square Static Maps image and the user's desired bbox, returns a
 * canvas containing only the portion of the image that matches the bbox.
 *
 * Uses Web Mercator pixel coordinates: we project bbox corners to WM pixels
 * at the chosen zoom, compute the WM pixel bounds of the rendered image,
 * and intersect to find the crop rectangle.
 */
function cropImageToBbox(
  img: HTMLImageElement,
  bbox: BBox,
  centerLat: number,
  centerLng: number,
  zoom: number,
  size: number,
  scale: number
): HTMLCanvasElement {
  // Web Mercator pixel coordinates at this zoom: 1 tile = 256px, world = 256*2^z pixels.
  const wmCenter = lngLatToWmPixel(centerLng, centerLat, zoom);
  const halfPx = size / 2;
  // Image (logical 640px) occupies these WM pixel bounds:
  const imgMinX = wmCenter.x - halfPx;
  const imgMinY = wmCenter.y - halfPx;
  // imgMax is just +size, but irrelevant — we only need crop offsets.

  // User bbox WM pixel bounds:
  const wmNW = lngLatToWmPixel(bbox.west, bbox.north, zoom); // top-left
  const wmSE = lngLatToWmPixel(bbox.east, bbox.south, zoom); // bottom-right

  // Crop rectangle in LOGICAL pixels (640-space):
  let cropX = wmNW.x - imgMinX;
  let cropY = wmNW.y - imgMinY;
  let cropW = wmSE.x - wmNW.x;
  let cropH = wmSE.y - wmNW.y;

  // Clamp to image bounds (defensive)
  cropX = Math.max(0, Math.min(size - 1, cropX));
  cropY = Math.max(0, Math.min(size - 1, cropY));
  cropW = Math.max(1, Math.min(size - cropX, cropW));
  cropH = Math.max(1, Math.min(size - cropY, cropH));

  // Convert to ACTUAL pixels (image is `size * scale` on each side)
  const sx = Math.round(cropX * scale);
  const sy = Math.round(cropY * scale);
  const sw = Math.round(cropW * scale);
  const sh = Math.round(cropH * scale);

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

/** Project lng/lat to logical Web Mercator pixel coordinates at zoom z. */
function lngLatToWmPixel(lng: number, lat: number, z: number) {
  const n = Math.pow(2, z);
  const px = ((lng + 180) / 360) * n * 256;
  const latRad = (lat * Math.PI) / 180;
  const py =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n *
    256;
  return { x: px, y: py };
}

/** Picks a Google Static Maps zoom that fits the bbox in a 640×640 frame. */
function pickStaticMapZoom(bbox: BBox): number {
  const ZOOM_PIXEL_FACTOR = 256; // base tile pixel size at zoom 0
  const targetPx = 640;

  const lngSpan = Math.abs(bbox.east - bbox.west);
  const latSpan = Math.abs(bbox.north - bbox.south);

  const lngZoom = Math.log2((360 * targetPx) / (lngSpan * ZOOM_PIXEL_FACTOR));
  const latZoom = Math.log2((180 * targetPx) / (latSpan * ZOOM_PIXEL_FACTOR));

  return Math.max(1, Math.min(20, Math.floor(Math.min(lngZoom, latZoom))));
}

// ---------------------------------------------------------------------------
// Esri World Imagery (tile stitching fallback, no key required)
// ---------------------------------------------------------------------------

async function fetchEsriStitched(bbox: BBox): Promise<ImageryResult> {
  const z = pickTileZoom(bbox, 8);
  const range = tileRange(bbox, z);

  const tileSize = 256;
  const cols = range.x1 - range.x0 + 1;
  const rows = range.y1 - range.y0 + 1;

  const canvas = document.createElement("canvas");
  canvas.width = cols * tileSize;
  canvas.height = rows * tileSize;
  const ctx = canvas.getContext("2d")!;

  const tileUrl = (x: number, y: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

  const promises: Promise<void>[] = [];
  for (let dy = 0; dy < rows; dy++) {
    for (let dx = 0; dx < cols; dx++) {
      const tx = range.x0 + dx;
      const ty = range.y0 + dy;
      promises.push(
        loadImage(tileUrl(tx, ty)).then((img) => {
          ctx.drawImage(img, dx * tileSize, dy * tileSize);
        })
      );
    }
  }
  await Promise.all(promises);

  return {
    provider: "esri",
    size: canvas.width,
    image: canvas,
    attribution: "© Esri, Maxar, Earthstar Geographics",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

// Slippy-map math (used by Esri/OSM tile path)

function lngLatToTile(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function pickTileZoom(bbox: BBox, maxTilesPerSide = 8, capZoom = 18): number {
  for (let z = capZoom; z >= 1; z--) {
    const a = lngLatToTile(bbox.west, bbox.north, z);
    const b = lngLatToTile(bbox.east, bbox.south, z);
    const w = Math.ceil(b.x) - Math.floor(a.x);
    const h = Math.ceil(b.y) - Math.floor(a.y);
    if (w <= maxTilesPerSide && h <= maxTilesPerSide) return z;
  }
  return 1;
}

function tileRange(bbox: BBox, z: number) {
  const nw = lngLatToTile(bbox.west, bbox.north, z);
  const se = lngLatToTile(bbox.east, bbox.south, z);
  return {
    x0: Math.floor(nw.x),
    y0: Math.floor(nw.y),
    x1: Math.ceil(se.x) - 1,
    y1: Math.ceil(se.y) - 1,
  };
}
