// Extracts a harmonious building palette from a painted ground texture.
//
// Strategy:
//   1. Downsample the image to 64×64.
//   2. Compute average RGB across all pixels.
//   3. Convert to HSL.
//   4. Derive three colors that read as "buildings sitting on this ground":
//        - base:    same hue, slight saturation bump, lightness pushed up
//                   so buildings stand out against typically-darker ground.
//        - hover:   hue shifted +30°, brighter, more saturated — distinct
//                   highlight color on selection/hover.
//        - emissive: very dim same-hue glow simulating warmth/lit windows.

export interface DerivedBuildingPalette {
  base: string;
  hover: string;
  emissive: string;
  emissiveIntensity: number;
}

export async function extractBuildingPalette(
  imageDataUrl: string
): Promise<DerivedBuildingPalette> {
  const img = await loadImg(imageDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;

  // Average RGB
  let r = 0,
    g = 0,
    b = 0,
    count = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  r /= count;
  g /= count;
  b /= count;

  const [h, s, l] = rgbToHsl(r, g, b);

  // BASE: same hue, push toward mid-light so buildings read against ground
  const baseL = clamp01(l < 0.4 ? l + 0.28 : l + 0.12);
  const baseS = clamp01(s + 0.05);
  const base = hslToHex(h, baseS, baseL);

  // HOVER: shift hue, brighter, more saturated (interaction highlight)
  const hoverH = (h + 30 / 360) % 1;
  const hoverS = clamp01(Math.max(s, 0.4) + 0.2);
  const hoverL = clamp01(0.55);
  const hover = hslToHex(hoverH, hoverS, hoverL);

  // EMISSIVE: very dim warm same-hue glow
  const emissive = hslToHex(h, clamp01(s * 0.7), clamp01(l * 0.2));

  return {
    base,
    hover,
    emissive,
    emissiveIntensity: 0.06,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** RGB (0-255) → HSL (0-1, 0-1, 0-1). */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

/** HSL (0-1) → "#RRGGBB" hex. */
function hslToHex(h: number, s: number, l: number): string {
  const hueToRgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  const toHex = (n: number) =>
    Math.round(clamp01(n) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
