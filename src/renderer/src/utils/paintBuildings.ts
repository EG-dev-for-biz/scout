// Paint Buildings via projective texturing.
//
// Captures the current viewport screenshot AND the active camera's
// view-projection matrix, sends the screenshot to Gemini with the active
// style's `buildingsPaintPrompt`, and returns the painted image + matrices
// ready to be applied to building meshes via projective sampling.

import * as THREE from "three";
import { restyleImage } from "@/utils/geminiRestyle";
import { captureCanvasSnapshot } from "@/utils/geminiRestyle";
import { StyleProfile } from "@/state/styleStore";

export interface PaintBuildingsResult {
  imageDataUrl: string;
  /** Combined projection*viewInverse 4×4 matrix (16 floats, row-major). */
  viewProjMatrix: number[];
  cameraPos: [number, number, number];
  elapsedMs: number;
}

/**
 * Paint the buildings using the current camera as the projection source.
 *
 * Steps:
 *   1. Capture the visible canvas as a PNG (already correctly framed).
 *   2. Snapshot the camera's matrixWorldInverse and projectionMatrix —
 *      multiplied gives us the view-projection that, applied to a world
 *      position, produces the same NDC coords the screenshot was rendered at.
 *   3. Send screenshot + buildingsPaintPrompt to Gemini.
 *   4. Return the painted result + matrix data for the projective shader.
 */
export async function paintBuildings(
  camera: THREE.Camera,
  style: StyleProfile
): Promise<PaintBuildingsResult> {
  const t0 = performance.now();

  // Step 1 — capture viewport
  const snapshot = captureCanvasSnapshot(1024);
  if (!snapshot) {
    throw new Error("Could not capture viewport — load a scene first.");
  }

  // Step 2 — capture camera matrices
  // Make sure the camera's matrices are up-to-date.
  camera.updateMatrixWorld();
  if ((camera as THREE.PerspectiveCamera).updateProjectionMatrix) {
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  }

  const view = new THREE.Matrix4().copy(camera.matrixWorld).invert();
  const proj = camera.projectionMatrix.clone();
  const viewProj = new THREE.Matrix4().multiplyMatrices(proj, view);

  const cameraPos: [number, number, number] = [
    camera.position.x,
    camera.position.y,
    camera.position.z,
  ];

  // Step 3 — Gemini paint
  const restyled = await restyleImage({
    imageDataUrl: snapshot,
    prompt: style.buildingsPaintPrompt,
  });

  return {
    imageDataUrl: restyled.imageDataUrl,
    viewProjMatrix: viewProj.toArray(), // column-major flat array of 16 floats
    cameraPos,
    elapsedMs: performance.now() - t0,
  };
}
