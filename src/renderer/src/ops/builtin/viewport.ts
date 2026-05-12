import { defineOperator } from "../define";

/**
 * `viewport.render_still` — capture the current viewport as a PNG
 * dataURL.
 *
 * The dataURL is stripped out of the tool result before it round-trips
 * to the model (see `summarizeToolResultForAi` in `@/ai/execute`).
 * Renderer-side `onToolResult` callbacks still receive the full
 * untouched value, so a "save shot" handler downstream of the chat
 * panel can write it to disk.
 *
 * Pair with the `afterToolCapture` hook on `runTurn` for visual
 * self-evaluation — after the AI changes weather / camera, inject a
 * fresh screenshot so the model can audit what it actually produced.
 */
export const RenderStillOp = defineOperator({
  id: "viewport.render_still",
  label: "Render Still",
  description:
    "Capture the current viewport as a PNG. Returns image bytes plus width and height. Use when the user asks for a snapshot, or to verify what the active camera frames after a change.",
  flags: { readonly: true },
  props: {},
  exec(ctx) {
    const viewport = ctx.services?.viewport;
    if (!viewport) {
      return {
        status: "cancelled",
        reason: "Render is renderer-only — no viewport service in this context.",
      };
    }
    const captured = viewport.capturePng();
    if (!captured) {
      return { status: "cancelled", reason: "Viewport handle not yet ready." };
    }
    return {
      status: "finished",
      value: {
        pngDataUrl: captured.dataUrl,
        width: captured.width,
        height: captured.height,
        sizeBytes: estimateDataUrlBytes(captured.dataUrl),
      },
    };
  },
});

function estimateDataUrlBytes(url: string): number {
  const comma = url.indexOf(",");
  if (comma < 0) return url.length;
  const b64 = url.length - comma - 1;
  return Math.round(b64 * 0.75);
}
