// Auto-Paint Buildings: photoreal-source projective texturing.
//
// One-click flow that:
//   1. Saves current camera + render mode
//   2. Switches to Photoreal 3D Tiles render mode
//   3. Programmatically tweens through 4 diagonal-elevated vantages
//   4. Awaits tile streaming at each vantage, then captures viewport
//   5. Restores original render mode + camera
//   6. Sends 4 captures to Gemini in parallel for stylization
//   7. Applies painted results to building shader as projective views
//
// The captures are taken from the photoreal mesh, so Gemini sees real
// architectural detail (windows, cornices, signage) and produces dramatically
// better paint quality than capturing from gray OSM extruded boxes.

import * as THREE from "three";
import { restyleImage, captureCanvasSnapshot } from "@/utils/geminiRestyle";
import { tilesRendererRef } from "@/utils/tilesRendererRef";
import { StyleProfile } from "@/state/styleStore";
import { useCameraStore, CameraSnapshot } from "@/state/cameraStore";
import { useRenderModeStore, RenderMode } from "@/state/renderModeStore";
import { useAreaStore } from "@/state/areaStore";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";
import { usePaintFlowStore } from "@/state/paintFlowStore";
import { useProjectStore } from "@/state/projectStore";

// Same projection scale used by Space.tsx for OSM building world coords.
const PROJ_SCALE = 51000;

const VANTAGE_FOV_DEG = 50;
const VANTAGE_ELEVATION_DEG = 30;
const VANTAGE_TARGET_HEIGHT = 50; // ~mid-rise building height in meters
const MIN_VANTAGE_DISTANCE = 300; // floor for tiny bboxes
const TWEEN_SETTLE_MS = 750; // 700ms tween + 50ms buffer
const TILES_LOAD_TIMEOUT_MS = 5000;
const PHOTOREAL_INIT_MS = 800; // time for mode swap + first tile stream

interface Capture {
  snapshot: string;
  viewProjMatrix: number[];
  cameraPos: [number, number, number];
}

/**
 * Run the full auto-paint sequence. Updates paintFlowStore for UI feedback.
 *
 * Has a graceful fallback: if no Google Maps key is configured (no photoreal
 * available), captures from whatever render mode is active without switching.
 */
export async function autoPaintBuildings(style: StyleProfile): Promise<void> {
  const flow = usePaintFlowStore.getState();
  const hasGoogle = !!(import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;

  // ── 0. Validate prerequisites ───────────────────────────────────────────
  const areas = useAreaStore.getState().areas;
  if (areas.length === 0) {
    flow.start(0);
    flow.finish("Load a scene first");
    return;
  }

  flow.start(4);

  // ── 1. Save state ──────────────────────────────────────────────────────
  const originalCamera = useCameraStore.getState().current;
  const originalMode = useRenderModeStore.getState().mode;
  const center = useAreaStore.getState().center;

  // Clear existing painted views — auto-paint replaces, doesn't accumulate
  usePaintedSceneStore.getState().clearBuildingsPaintedViews();

  try {
    // ── 2. Switch to photoreal source (if available) ────────────────────
    if (hasGoogle && originalMode !== "photoreal") {
      flow.setPhase("init");
      flow.setMessage("Loading photoreal source…");
      useRenderModeStore.getState().setMode("photoreal");
      await sleep(PHOTOREAL_INIT_MS);
    }

    // ── 3. Compute vantages from bbox ───────────────────────────────────
    const vantages = computeVantages(center);

    // ── 4. Sequential capture ───────────────────────────────────────────
    flow.setPhase("capturing");
    const captures: Capture[] = [];
    const aspect = getCanvasAspect();

    for (let i = 0; i < vantages.length; i++) {
      flow.setMessage(`Capturing photoreal view ${i + 1}/${vantages.length}…`);
      flow.setProgress({ captured: i });

      // Move camera
      useCameraStore.getState().requestFraming(vantages[i]);
      await sleep(TWEEN_SETTLE_MS);

      // Wait for tiles to finish streaming for this view
      if (hasGoogle) {
        await awaitTilesLoadEnd(TILES_LOAD_TIMEOUT_MS);
      }

      // Force one more frame after tile load
      await rAFTwice();

      // Capture
      const snapshot = captureCanvasSnapshot(1024);
      if (!snapshot) throw new Error(`Capture ${i + 1} failed`);

      captures.push({
        snapshot,
        viewProjMatrix: computeViewProjFromSnap(vantages[i], aspect),
        cameraPos: vantages[i].position,
      });
    }
    flow.setProgress({ captured: vantages.length });

    // ── 5. Restore mode + camera (in parallel with Gemini calls) ────────
    if (originalMode !== useRenderModeStore.getState().mode) {
      useRenderModeStore.getState().setMode(originalMode);
    }
    if (originalCamera) {
      useCameraStore.getState().requestFraming(originalCamera);
    }

    // ── 6. Parallel Gemini paint ────────────────────────────────────────
    flow.setPhase("painting");
    flow.setMessage(`Painting ${captures.length} views in parallel…`);

    const results = await Promise.allSettled(
      captures.map((c) =>
        restyleImage({
          imageDataUrl: c.snapshot,
          prompt: style.buildingsPaintPrompt,
        })
      )
    );

    // ── 7. Apply results ────────────────────────────────────────────────
    let successes = 0;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        usePaintedSceneStore.getState().addBuildingsPaintedView({
          imageDataUrl: r.value.imageDataUrl,
          viewProjMatrix: captures[i].viewProjMatrix,
          cameraPos: captures[i].cameraPos,
          styleId: style.id,
        });
        successes++;
        flow.setProgress({ painted: successes });
      } else {
        console.warn(`[AutoPaint] view ${i + 1} failed:`, r.reason);
      }
    });

    // Mark project dirty so File menu prompts to save
    useProjectStore.getState().markDirty();

    if (successes === 0) {
      flow.finish("All paint requests failed — check your network/API quota");
    } else if (successes < captures.length) {
      flow.finish(`Only ${successes}/${captures.length} views painted (some calls failed)`);
    } else {
      flow.finish();
    }
  } catch (err) {
    console.error("[AutoPaint] failed:", err);
    // Best-effort restore
    if (originalMode !== useRenderModeStore.getState().mode) {
      useRenderModeStore.getState().setMode(originalMode);
    }
    if (originalCamera) {
      useCameraStore.getState().requestFraming(originalCamera);
    }
    flow.finish((err as Error).message || "Auto-paint failed");
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Vantage geometry
// ───────────────────────────────────────────────────────────────────────────

function computeVantages(
  center: { lat: number; lng: number }[]
): CameraSnapshot[] {
  const refLat = (center[0].lat + center[1].lat) / 2;
  const lngSpan = Math.abs(center[0].lng - center[1].lng);
  const latSpan = Math.abs(center[0].lat - center[1].lat);

  // bbox extent in scene meters (matches Space.tsx projection)
  const widthM = lngSpan * PROJ_SCALE * Math.cos((refLat * Math.PI) / 180);
  const heightM = latSpan * PROJ_SCALE;
  const longestSide = Math.max(widthM, heightM);

  // Distance from origin so bbox fills ~70% of frame at VANTAGE_FOV_DEG vert FOV
  const halfFovRad = (VANTAGE_FOV_DEG / 2) * (Math.PI / 180);
  const distance = Math.max(
    MIN_VANTAGE_DISTANCE,
    longestSide / 2 / Math.tan(halfFovRad)
  );

  const elevationRad = (VANTAGE_ELEVATION_DEG * Math.PI) / 180;
  const horizontal = distance * Math.cos(elevationRad);
  const elevation = distance * Math.sin(elevationRad);

  // 4 CARDINAL directions perpendicular to each cardinal building face.
  // In our scene, +X = east, +Z = south. So:
  //   - North vantage: position at -Z, looks at origin (south)
  //   - East vantage:  position at +X, looks at origin (west)
  //   - South vantage: position at +Z, looks at origin (north)
  //   - West vantage:  position at -X, looks at origin (east)
  // Each capture's pixels project onto the SAME-FACING wall without skew.
  const cardinals: Array<[number, number]> = [
    [0, -1], // North → looks south
    [+1, 0], // East  → looks west
    [0, +1], // South → looks north
    [-1, 0], // West  → looks east
  ];

  return cardinals.map(([sx, sz]) => ({
    position: [
      sx * horizontal,
      elevation,
      sz * horizontal,
    ] as [number, number, number],
    target: [0, VANTAGE_TARGET_HEIGHT, 0] as [number, number, number],
    fov: VANTAGE_FOV_DEG,
  }));
}

// ───────────────────────────────────────────────────────────────────────────
// View-projection matrix construction
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
// Tile-load awaiting
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resolves when the active TilesRenderer fires 'tiles-load-end' or after
 * `timeoutMs`. Always resolves — never rejects — so capture proceeds even
 * if tiles haven't fully loaded.
 */
function awaitTilesLoadEnd(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const tiles = tilesRendererRef.current;
    if (!tiles) {
      // No tiles renderer mounted → nothing to wait for
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

// ───────────────────────────────────────────────────────────────────────────
// Async helpers
// ───────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function rAFTwice(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
