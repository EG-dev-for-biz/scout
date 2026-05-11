// Surface painting pipeline.
//
// Phase 1 (live): paint the satellite ground texture via Gemini.
//   1. Re-fetch the aerial imagery for the current bbox.
//   2. Send it to Gemini with the active style's groundTexturePrompt.
//   3. Return the restyled data URL — caller stores it in paintedSceneStore.
//
// Phase 2 (deferred): per-building roof bake (top-down ortho render → Gemini).
// Phase 3 (deferred): facade projection from N/E/S/W cardinal renders.

import { fetchGroundImagery, BBox } from "@/utils/tileProvider";
import { restyleImage, GeminiRestyleError } from "@/utils/geminiRestyle";
import { StyleProfile } from "@/state/styleStore";

export interface PaintResult {
  imageDataUrl: string;
  elapsedMs: number;
}
export type PaintGroundResult = PaintResult;
export type PaintSkyResult = PaintResult;

/**
 * Paints the scene's ground texture in the given style.
 *
 * Steps:
 *   - Fetch fresh aerial imagery for `bbox` (Google Static Maps if available,
 *     else Esri).
 *   - Convert the resulting canvas/image to a PNG data URL.
 *   - Send to Gemini's image-edit model with the style's ground prompt.
 *   - Return the restyled data URL ready to be applied as a Three.js texture.
 *
 * Throws on geocoding/network/Gemini failures.
 */
export async function paintGround(
  bbox: BBox,
  style: StyleProfile
): Promise<PaintGroundResult> {
  const t0 = performance.now();

  // Step 1: source aerial
  const source = await fetchGroundImagery(bbox);
  const sourceCanvas =
    source.image instanceof HTMLCanvasElement
      ? source.image
      : imageToCanvas(source.image);

  // Step 2: Downscale to ~1024 on the longer edge to keep request payload small.
  // We deliberately do NOT crop — cropping shifts the aspect ratio and the
  // result no longer aligns with the bbox plane in the 3D scene. The prompt
  // instructs Gemini to remove watermarks/labels, which is the cleaner fix.
  const downscaled = downscaleCanvas(sourceCanvas, 1024);
  const sourceDataUrl = downscaled.toDataURL("image/png");

  // Step 3: Gemini paint
  const restyled = await restyleImage({
    imageDataUrl: sourceDataUrl,
    prompt: style.groundTexturePrompt,
  });

  return {
    imageDataUrl: restyled.imageDataUrl,
    elapsedMs: performance.now() - t0,
  };
}

/**
 * Paints an equirectangular skybox panorama in the given style.
 *
 * Steps:
 *   - Generate a 1024×512 (2:1) gradient placeholder canvas (Gemini's image
 *     edit model needs an input image — pure text-to-image isn't supported).
 *   - Send to Gemini with the style's skyPrompt asking for a panorama.
 *   - Return the painted result for use as a Three.js EquirectangularReflection
 *     map on scene.background + scene.environment.
 */
export async function paintSky(style: StyleProfile): Promise<PaintSkyResult> {
  const t0 = performance.now();

  // 2:1 gradient placeholder — sky blue at top, lighter at horizon.
  const placeholder = makeSkyGradient(1024, 512);
  const sourceDataUrl = placeholder.toDataURL("image/png");

  const restyled = await restyleImage({
    imageDataUrl: sourceDataUrl,
    prompt: style.skyPrompt,
  });

  return {
    imageDataUrl: restyled.imageDataUrl,
    elapsedMs: performance.now() - t0,
  };
}

function makeSkyGradient(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  // Vertical gradient: deeper blue at top, lighter cream/white at bottom (horizon)
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "#3a73c8");
  grad.addColorStop(0.5, "#88baf2");
  grad.addColorStop(1, "#ffe4c4");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  return c;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}

function downscaleCanvas(src: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
  if (scale === 1) return src;

  const dw = Math.round(src.width * scale);
  const dh = Math.round(src.height * scale);
  const dst = document.createElement("canvas");
  dst.width = dw;
  dst.height = dh;
  dst.getContext("2d")!.drawImage(src, 0, 0, dw, dh);
  return dst;
}

/** Crop a fraction off the bottom of a canvas. Used to strip provider watermarks. */
function cropBottom(src: HTMLCanvasElement, fraction: number): HTMLCanvasElement {
  const cropPx = Math.round(src.height * fraction);
  const newH = src.height - cropPx;
  const dst = document.createElement("canvas");
  dst.width = src.width;
  dst.height = newH;
  // Draw the source from the top — the bottom `cropPx` simply isn't included.
  dst.getContext("2d")!.drawImage(src, 0, 0, src.width, newH, 0, 0, src.width, newH);
  return dst;
}

export { GeminiRestyleError };
