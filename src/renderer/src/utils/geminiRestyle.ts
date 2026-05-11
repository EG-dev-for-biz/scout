// Gemini image-to-image restyling.
//
// Sends a captured viewport snapshot + a style prompt to Google's Gemini
// image-edit model and returns the restyled PNG as a data URL.
//
// Model: gemini-2.5-flash-image-preview ("Nano Banana") — supports both
// image inputs and image outputs. Lives at the standard
// generativelanguage.googleapis.com endpoint.

const GEMINI_KEY: string | undefined =
  typeof import.meta !== "undefined"
    ? (import.meta as any).env?.VITE_GEMINI_API_KEY
    : undefined;

// "Nano Banana" — Gemini's stable image-edit model. Available models can
// be listed via GET /v1beta/models?key=KEY (look for `generateContent` in
// supportedGenerationMethods + image-related display name).
//
// Alternatives if quality matters more than speed:
//   - gemini-3-pro-image-preview ("Nano Banana Pro")
//   - gemini-3.1-flash-image-preview ("Nano Banana 2")
const MODEL = "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface RestyleRequest {
  /** Source image as data URL ("data:image/png;base64,...") or raw base64 (no prefix). */
  imageDataUrl: string;
  /** Style prompt — phrased as an editing instruction. */
  prompt: string;
}

export interface RestyleResult {
  /** Restyled image as a data URL. */
  imageDataUrl: string;
  /** Optional text annotation Gemini returned alongside (rare, but possible). */
  textNote?: string;
  /** Approx milliseconds for the API call. */
  elapsedMs: number;
}

export class GeminiRestyleError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "GeminiRestyleError";
  }
}

/**
 * Sends an image + a style prompt to Gemini and returns the restyled image.
 *
 * Throws GeminiRestyleError on auth / quota / network / parsing failures.
 */
export async function restyleImage(req: RestyleRequest): Promise<RestyleResult> {
  if (!GEMINI_KEY) {
    throw new GeminiRestyleError(
      "VITE_GEMINI_API_KEY is not set in .env.local"
    );
  }

  const base64 = stripDataUrlPrefix(req.imageDataUrl);

  const body = {
    contents: [
      {
        parts: [
          { text: req.prompt },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64,
            },
          },
        ],
      },
    ],
  };

  const startedAt = performance.now();

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?key=${GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GeminiRestyleError(`Network error: ${(err as Error).message}`);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.text();
      detail = errBody.slice(0, 500);
    } catch {
      /* ignore */
    }
    throw new GeminiRestyleError(
      `Gemini API error ${res.status} ${res.statusText} ${detail}`,
      res.status
    );
  }

  const json = await res.json();
  const elapsedMs = performance.now() - startedAt;

  // Extract the first image part out of the response
  const candidates = json.candidates ?? [];
  let textNote: string | undefined;
  for (const c of candidates) {
    const parts = c.content?.parts ?? [];
    for (const p of parts) {
      if (p.inlineData?.data) {
        return {
          imageDataUrl: `data:${p.inlineData.mimeType ?? "image/png"};base64,${p.inlineData.data}`,
          textNote,
          elapsedMs,
        };
      }
      if (p.text) {
        textNote = (textNote ?? "") + p.text;
      }
    }
  }

  // No image found — surface any text Gemini returned for debugging
  throw new GeminiRestyleError(
    `Gemini returned no image. ${textNote ? `Note: ${textNote}` : "Empty response."}`
  );
}

/**
 * Capture the current Three.js canvas as a downscaled PNG data URL.
 * Default 1024px on the longer edge to keep request payloads under ~1MB.
 */
export function captureCanvasSnapshot(maxEdge = 1024): string | null {
  const canvases = Array.from(document.querySelectorAll("canvas"));
  // Prefer the WebGL canvas (R3F's is non-trivial to identify; we pick
  // the largest one as a heuristic).
  if (canvases.length === 0) return null;
  const canvas = canvases.reduce((best, c) =>
    c.width * c.height > best.width * best.height ? c : best
  );

  const sw = canvas.width;
  const sh = canvas.height;
  if (sw === 0 || sh === 0) return null;

  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  const off = document.createElement("canvas");
  off.width = dw;
  off.height = dh;
  const ctx = off.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, dw, dh);
  return off.toDataURL("image/png");
}

function stripDataUrlPrefix(input: string): string {
  const m = /^data:[^;]+;base64,(.*)$/.exec(input);
  return m ? m[1] : input;
}

export function hasGeminiKey(): boolean {
  return !!GEMINI_KEY;
}
