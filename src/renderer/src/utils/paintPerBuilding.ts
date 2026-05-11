// Per-building paint pass.
//
// For each visible OSM building, programmatically:
//   1. Position the camera PERPENDICULAR to the building's longest face,
//      at mid-building-height, framed tight on the building.
//   2. Wait for photoreal tiles to stream for that camera position.
//   3. Capture the canvas — now showing this specific building's REAL FACADE
//      (not a top-down/oblique view).
//   4. Send the per-building snapshot to Gemini for individual stylization.
//   5. Apply painted result via PROJECTIVE TEXTURING (not default UV wrap)
//      using the camera matrix it was captured at — so the painted facade
//      lands ONLY on the wall it was captured from, never on rooftops or
//      the wrong sides.
//
// Reuses the existing camera tween + tile-streaming infrastructure that
// auto-paint already uses for cardinal captures. Auto-paint is a prerequisite
// because we need to be in photoreal mode and have the tiles renderer mounted.

import * as THREE from "three";
import {
  restyleImage,
  captureCanvasSnapshot,
} from "@/utils/geminiRestyle";
import { tilesRendererRef } from "@/utils/tilesRendererRef";
import { StyleProfile } from "@/state/styleStore";
import { useCameraStore, CameraSnapshot } from "@/state/cameraStore";
import { useRenderModeStore } from "@/state/renderModeStore";
import { useAreaStore } from "@/state/areaStore";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";
import { usePaintFlowStore } from "@/state/paintFlowStore";
import { useProjectStore } from "@/state/projectStore";

const PROJ_SCALE = 51000;
const MAX_BUILDINGS = 15;
const PARALLEL_BATCH = 3;
const TWEEN_SETTLE_MS = 800;
const TILES_LOAD_TIMEOUT_MS = 4500;
const FACADE_FOV_DEG = 45;
const FACADE_VERTICAL_PAD = 1.4; // building should fill ~70% vertically
const FACADE_MIN_DISTANCE = 30;

interface BuildingMeta {
  id: string;
  centroid: THREE.Vector3;
  width: number; // along longest cardinal axis
  depth: number; // along the other axis
  height: number;
  /** "x" if longest face is east/west, "z" if longest face is north/south */
  longestAxis: "x" | "z";
  /** 8 corners of the extruded bbox in world space (used for silhouette masking). */
  corners: THREE.Vector3[];
  /** Raw OSM tags — used for prompt enrichment (material, color, roof, name…). */
  tags: Record<string, string | undefined>;
}

interface PerBuildingCapture {
  id: string;
  vantage: CameraSnapshot;
}

interface CapturedSnapshot {
  id: string;
  /** Masked image dataURL — building silhouette only, surroundings faded out. */
  snapshot: string;
  vantage: CameraSnapshot;
  meta: BuildingMeta;
}

/**
 * Public entrypoint. Runs the per-building bake.
 */
export async function paintPerBuilding(style: StyleProfile): Promise<void> {
  const flow = usePaintFlowStore.getState();
  const hasGoogle = !!(import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;

  const areas = useAreaStore.getState().areas;
  if (areas.length === 0) {
    flow.start(0);
    flow.finish("Load a scene first");
    return;
  }
  if (!hasGoogle) {
    flow.start(0);
    flow.finish("Per-building bake requires the Google Maps key for photoreal source");
    return;
  }

  // ── 1. Compute building metadata + rank by importance ──────────────────
  const allMetas = computeBuildingMetadata(
    areas,
    useAreaStore.getState().center
  );
  const ranked = rankBuildingsByImportance(allMetas);
  const targets = ranked.slice(0, MAX_BUILDINGS);

  if (targets.length === 0) {
    flow.start(0);
    flow.finish("No buildings large enough to bake");
    return;
  }

  flow.start(targets.length);
  flow.setPhase("init");
  flow.setMessage(`Preparing per-building bake (${targets.length} buildings)…`);

  // ── 2. Save state ──────────────────────────────────────────────────────
  const originalCamera = useCameraStore.getState().current;
  const originalMode = useRenderModeStore.getState().mode;

  try {
    // Switch to photoreal so per-building captures show real Google detail
    if (originalMode !== "photoreal") {
      useRenderModeStore.getState().setMode("photoreal");
      await sleep(800);
    }

    // ── 3. Sequential per-building capture (mask to building silhouette) ──
    flow.setPhase("capturing");
    const aspect = getCanvasAspect();
    const snapshots: CapturedSnapshot[] = [];

    for (let i = 0; i < targets.length; i++) {
      const b = targets[i];
      flow.setMessage(
        `Capturing building ${i + 1}/${targets.length}…`
      );
      flow.setProgress({ captured: i });

      const vantage = computeFacadeVantage(b);

      useCameraStore.getState().requestFraming(vantage);
      await sleep(TWEEN_SETTLE_MS);
      await awaitTilesLoadEnd(TILES_LOAD_TIMEOUT_MS);
      await rAFTwice();

      const rawSnapshot = captureCanvasSnapshot(1024);
      if (!rawSnapshot) {
        console.warn(`[PerBuildingPaint] capture failed for ${b.id}`);
        continue;
      }

      // Critical step: mask the captured image to JUST this building's
      // silhouette so Gemini doesn't paint surrounding context (other
      // buildings, parks, streets) onto the target's facade.
      const viewProj = computeViewProjFromSnap(vantage, aspect);
      const polygon = projectBboxToScreenPolygon(b.corners, viewProj, 1024);
      const masked = polygon
        ? await maskImageToPolygon(rawSnapshot, polygon, 1024)
        : rawSnapshot;

      // Publish for the debug preview overlay so the user can verify
      // the capture is actually a facade view (not an aerial accidentally).
      flow.setLastCapture(masked);

      snapshots.push({ id: b.id, snapshot: masked, vantage, meta: b });
    }

    flow.setProgress({ captured: targets.length });

    // ── 4. Restore mode + camera (parallel with API calls) ──────────────
    if (originalMode !== useRenderModeStore.getState().mode) {
      useRenderModeStore.getState().setMode(originalMode);
    }
    if (originalCamera) {
      useCameraStore.getState().requestFraming(originalCamera);
    }

    // ── 5. Parallel Gemini paints in batches ────────────────────────────
    flow.setPhase("painting");
    flow.setMessage(`Painting ${snapshots.length} buildings in parallel…`);

    const newViews: Record<
      string,
      {
        imageDataUrl: string;
        viewProjMatrix: number[];
        cameraPos: [number, number, number];
      }
    > = {};
    let painted = 0;

    for (let i = 0; i < snapshots.length; i += PARALLEL_BATCH) {
      const batch = snapshots.slice(i, i + PARALLEL_BATCH);

      const results = await Promise.allSettled(
        batch.map((s) =>
          restyleImage({
            imageDataUrl: s.snapshot,
            prompt: buildPerBuildingPrompt(style, s.meta),
          })
        )
      );

      results.forEach((r, idx) => {
        const s = batch[idx];
        if (r.status === "fulfilled") {
          const viewProj = computeViewProjFromSnap(s.vantage, aspect);
          newViews[s.id] = {
            imageDataUrl: r.value.imageDataUrl,
            viewProjMatrix: viewProj,
            cameraPos: s.vantage.position,
          };
          // Show last painted result in the debug overlay
          flow.setLastPainted(r.value.imageDataUrl);
          painted++;
        } else {
          console.warn(`[PerBuildingPaint] paint failed for ${s.id}:`, r.reason);
        }
      });

      flow.setProgress({ painted });
      flow.setMessage(`Painted ${painted}/${snapshots.length}…`);
    }

    // ── 6. Apply ────────────────────────────────────────────────────────
    usePaintedSceneStore.getState().setPerBuildingViews(newViews, style.id);
    useProjectStore.getState().markDirty();

    if (painted === 0) {
      flow.finish("All per-building paints failed");
    } else if (painted < targets.length) {
      flow.finish(`${painted}/${targets.length} buildings baked (some failed)`);
    } else {
      flow.finish();
    }
  } catch (err) {
    console.error("[PerBuildingPaint] failed:", err);
    if (originalMode !== useRenderModeStore.getState().mode) {
      useRenderModeStore.getState().setMode(originalMode);
    }
    if (originalCamera) {
      useCameraStore.getState().requestFraming(originalCamera);
    }
    flow.finish((err as Error).message || "Per-building bake failed");
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Building metadata + ranking
// ───────────────────────────────────────────────────────────────────────────

function computeBuildingMetadata(
  areas: any[],
  center: { lat: number; lng: number }[]
): BuildingMeta[] {
  const refLat = (center[0].lat + center[1].lat) / 2;
  const refLng = (center[0].lng + center[1].lng) / 2;
  const cosLat = Math.cos((refLat * Math.PI) / 180);

  const out: BuildingMeta[] = [];

  areas.forEach((bld: any, idx: number) => {
    if (!bld.geometry || bld.geometry.length < 3) return;

    const xs: number[] = [];
    const zs: number[] = [];
    bld.geometry.forEach((pt: any) => {
      xs.push((pt.lng - refLng) * PROJ_SCALE * cosLat);
      zs.push(-(pt.lat - refLat) * PROJ_SCALE);
    });

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);

    let height = parseFloat(bld.tags?.height || "");
    const levels = parseFloat(bld.tags?.["building:levels"] || "");
    if (isNaN(height)) height = 10;
    if (!isNaN(levels)) height = levels * 2.2;

    const sizeX = maxX - minX;
    const sizeZ = maxZ - minZ;

    const corners = [
      new THREE.Vector3(minX, 0, minZ),
      new THREE.Vector3(maxX, 0, minZ),
      new THREE.Vector3(maxX, 0, maxZ),
      new THREE.Vector3(minX, 0, maxZ),
      new THREE.Vector3(minX, height, minZ),
      new THREE.Vector3(maxX, height, minZ),
      new THREE.Vector3(maxX, height, maxZ),
      new THREE.Vector3(minX, height, maxZ),
    ];

    out.push({
      id: String(bld.id ?? `idx_${idx}`),
      centroid: new THREE.Vector3(
        (minX + maxX) / 2,
        height / 2,
        (minZ + maxZ) / 2
      ),
      width: Math.max(sizeX, sizeZ),
      depth: Math.min(sizeX, sizeZ),
      height,
      longestAxis: sizeX >= sizeZ ? "x" : "z",
      corners,
      tags: bld.tags || {},
    });
  });

  return out;
}

function rankBuildingsByImportance(metas: BuildingMeta[]): BuildingMeta[] {
  // Importance = footprint area × height (volumetric)
  return [...metas].sort((a, b) => {
    const va = a.width * a.depth * a.height;
    const vb = b.width * b.depth * b.height;
    return vb - va;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Per-building vantage point
// ───────────────────────────────────────────────────────────────────────────

function computeFacadeVantage(b: BuildingMeta): CameraSnapshot {
  // Camera looks at the building's centroid, perpendicular to its LONGEST face
  // at mid-building height.
  const halfFovRad = (FACADE_FOV_DEG / 2) * (Math.PI / 180);

  // Distance based on building height — we want the building to fill ~70%
  // vertically, so distance = height × FACADE_VERTICAL_PAD / (2 × tan(halfFov))
  let distance = (b.height * FACADE_VERTICAL_PAD) / (2 * Math.tan(halfFovRad));

  // Also ensure horizontal width is captured
  const horizDist = (b.width * 0.6) / (2 * Math.tan(halfFovRad));
  distance = Math.max(distance, horizDist, FACADE_MIN_DISTANCE);

  // Perpendicular to longest face:
  //   - If longestAxis = "x" (long east-west): camera is north or south of building
  //   - If longestAxis = "z" (long north-south): camera is east or west of building
  const offsetX = b.longestAxis === "z" ? distance : 0;
  const offsetZ = b.longestAxis === "x" ? -distance : 0; // -Z = north; pick north side

  return {
    position: [
      b.centroid.x + offsetX,
      b.centroid.y, // mid-building height (looks straight at the middle of the facade)
      b.centroid.z + offsetZ,
    ],
    target: [b.centroid.x, b.centroid.y, b.centroid.z],
    fov: FACADE_FOV_DEG,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Prompt
// ───────────────────────────────────────────────────────────────────────────

function buildPerBuildingPrompt(style: StyleProfile, meta: BuildingMeta): string {
  const hints = buildOsmTagHints(meta);
  const hintBlock = hints.length
    ? `\n\nKnown facts about THIS building (from OSM data — preserve these in your repaint):\n${hints.map((h) => `  • ${h}`).join("\n")}`
    : "";

  return (
    `This image shows a SINGLE BUILDING viewed perpendicular to its facade. ` +
    `Repaint just this building in the EXACT style described below. PRESERVE: ` +
    `the building's silhouette, the window grid (count + spacing), floor count, ` +
    `balconies, doors, signage, and roofline.${hintBlock}\n\n` +
    `Style: ${style.buildingsPaintPrompt}\n\n` +
    `Important: the painted building's pixels must remain at the SAME pixel ` +
    `positions as in the input — do not move, scale, or recompose the building. ` +
    `Background (sky, neighboring buildings, ground in front of base) can be ` +
    `simplified or de-emphasized but must not move the building.`
  );
}

/**
 * Translate OSM building tags into natural-language hints that ground the
 * Gemini paint in real-world facts. Each hint is a single-clause descriptor
 * the model can interpret as a fact about the target.
 *
 * Tags we look at: building (use type), building:material, building:colour,
 * roof:shape, roof:material, roof:colour, building:levels, name,
 * heritage/historic, height, addr:*.
 */
function buildOsmTagHints(meta: BuildingMeta): string[] {
  const t = meta.tags;
  const hints: string[] = [];

  // Building name (landmarks like "Empire State Building" carry massive context)
  const name = t.name || t["name:en"];
  if (name && typeof name === "string") {
    hints.push(`This building is named: "${name}"`);
  }

  // Use type
  const buildingType =
    t.building && t.building !== "yes" && t.building !== "true"
      ? t.building
      : null;
  if (buildingType) {
    const friendlyType: Record<string, string> = {
      apartments: "apartment building",
      residential: "residential building",
      commercial: "commercial building",
      retail: "retail building",
      office: "office tower",
      industrial: "industrial building",
      warehouse: "warehouse",
      church: "church",
      cathedral: "cathedral",
      mosque: "mosque",
      synagogue: "synagogue",
      hotel: "hotel",
      hospital: "hospital",
      school: "school",
      university: "university building",
      stadium: "stadium",
      train_station: "train station",
      garage: "parking garage",
      house: "single-family house",
      detached: "detached house",
      semidetached_house: "semi-detached house",
      terrace: "terrace house",
      bungalow: "bungalow",
      government: "government building",
    };
    hints.push(`Type: ${friendlyType[buildingType] ?? buildingType}`);
  }

  // Wall material + color
  const wallMaterial = t["building:material"];
  const wallColor = t["building:colour"] || t["building:color"];
  if (wallMaterial && wallColor) {
    hints.push(`Walls are ${wallColor} ${wallMaterial}`);
  } else if (wallMaterial) {
    hints.push(`Walls are made of ${wallMaterial}`);
  } else if (wallColor) {
    hints.push(`Wall color: ${wallColor}`);
  }

  // Roof
  const roofShape = t["roof:shape"];
  const roofMaterial = t["roof:material"];
  const roofColor = t["roof:colour"] || t["roof:color"];
  const roofParts: string[] = [];
  if (roofShape) roofParts.push(`${roofShape} shape`);
  if (roofMaterial) roofParts.push(`${roofMaterial} material`);
  if (roofColor) roofParts.push(`${roofColor} color`);
  if (roofParts.length > 0) {
    hints.push(`Roof: ${roofParts.join(", ")}`);
  }

  // Floor count → window grid expectation
  const levels = t["building:levels"];
  if (levels && !isNaN(parseFloat(levels))) {
    hints.push(`Has ${levels} floors (preserve floor lines + window rows)`);
  } else if (meta.height) {
    const estLevels = Math.max(1, Math.round(meta.height / 3.0));
    hints.push(`~${estLevels} floors based on height`);
  }

  // Heritage / historic significance
  if (t.heritage || t.historic) {
    hints.push(`This is a heritage/historic building — preserve its period character`);
  }

  // Architect or year (rare but valuable)
  if (t.architect) hints.push(`Architect: ${t.architect}`);
  if (t.start_date || t["construction:date"]) {
    hints.push(`Era: ${t.start_date ?? t["construction:date"]}`);
  }

  // Address (just for landmark recognition; helps Gemini know location)
  const street = t["addr:street"];
  const city = t["addr:city"];
  if (street && city) {
    hints.push(`Located on ${street} in ${city}`);
  }

  // Amenity (e.g. "restaurant", "cafe") gives context for ground-floor signage
  if (t.amenity) {
    hints.push(`Ground-floor use: ${t.amenity}`);
  }

  return hints;
}

// ───────────────────────────────────────────────────────────────────────────
// Matrix construction
// ───────────────────────────────────────────────────────────────────────────

function computeViewProjFromSnap(snap: CameraSnapshot, aspect: number): number[] {
  const cam = new THREE.PerspectiveCamera(snap.fov, aspect, 0.1, 7000);
  cam.position.set(...snap.position);
  cam.lookAt(...snap.target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const view = new THREE.Matrix4().copy(cam.matrixWorld).invert();
  const viewProj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, view);
  return viewProj.toArray();
}

function getCanvasAspect(): number {
  const canvas = document.querySelector("canvas");
  if (!canvas || canvas.width === 0) return 16 / 9;
  return canvas.width / canvas.height;
}

// ───────────────────────────────────────────────────────────────────────────
// Tiles + async helpers
// ───────────────────────────────────────────────────────────────────────────

function awaitTilesLoadEnd(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const tiles = tilesRendererRef.current;
    if (!tiles) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        tiles.removeEventListener("tiles-load-end", handler);
      } catch {
        /* ignore */
      }
      clearTimeout(timer);
      resolve();
    };
    const handler = () => finish();
    const timer = setTimeout(finish, timeoutMs);
    tiles.addEventListener("tiles-load-end", handler);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function rAFTwice(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Silhouette masking — kills surrounding context before Gemini sees the image
// ───────────────────────────────────────────────────────────────────────────

/**
 * Project a building's 8 bbox corners through the camera view-projection,
 * convert to pixel coordinates, then return the convex hull as a polygon.
 * Returns null if the building is entirely behind the camera.
 */
function projectBboxToScreenPolygon(
  corners: THREE.Vector3[],
  viewProj: number[],
  imgSize: number
): { x: number; y: number }[] | null {
  const m = new THREE.Matrix4().fromArray(viewProj);

  const points2D: { x: number; y: number }[] = [];
  for (const c of corners) {
    const v = new THREE.Vector4(c.x, c.y, c.z, 1).applyMatrix4(m);
    if (v.w <= 0) continue;
    const ndcX = v.x / v.w;
    const ndcY = v.y / v.w;
    points2D.push({
      x: ((ndcX + 1) / 2) * imgSize,
      y: ((1 - ndcY) / 2) * imgSize,
    });
  }
  if (points2D.length < 3) return null;
  return convexHull(points2D);
}

/**
 * Andrew's monotone chain convex hull. O(n log n).
 * Used to compute the building's screen-space silhouette from its 8 bbox
 * corners' projected positions.
 */
function convexHull(
  pts: { x: number; y: number }[]
): { x: number; y: number }[] {
  if (pts.length < 3) return pts;
  const sorted = [...pts].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (
    o: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number }
  ) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: typeof sorted = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: typeof sorted = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Mask an image to a polygon: pixels inside the polygon (slightly expanded
 * for soft edges) keep their original color; pixels outside fade to a
 * neutral mid-gray. Result: Gemini sees a clean isolated building, with no
 * neighboring context to confuse "this is the target" detection.
 */
async function maskImageToPolygon(
  imgDataUrl: string,
  polygon: { x: number; y: number }[],
  imgSize: number
): Promise<string> {
  const img = await loadImage(imgDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;

  const sx = canvas.width / imgSize;
  const sy = canvas.height / imgSize;

  // 1. Fill with neutral mid-gray (so Gemini's response stays at consistent
  //    lighting and doesn't try to repaint the masked area)
  ctx.fillStyle = "#888888";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Clip to expanded polygon so we keep a few pixels of surrounding
  //    context (helps Gemini understand scale + shadows at the building's edge)
  const expanded = expandPolygon(polygon, 12);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(expanded[0].x * sx, expanded[0].y * sy);
  for (let i = 1; i < expanded.length; i++) {
    ctx.lineTo(expanded[i].x * sx, expanded[i].y * sy);
  }
  ctx.closePath();
  ctx.clip();

  // 3. Draw the source image inside the clipped region only
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

/** Expand a convex polygon outward by `pad` pixels (centroid-relative scale). */
function expandPolygon(
  polygon: { x: number; y: number }[],
  pad: number
): { x: number; y: number }[] {
  if (polygon.length === 0) return polygon;
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
  return polygon.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return p;
    return { x: p.x + (dx / d) * pad, y: p.y + (dy / d) * pad };
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
