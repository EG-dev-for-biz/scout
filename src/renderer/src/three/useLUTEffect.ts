import { useEffect, useState } from "react";
import { LUT3DEffect, LUTCubeLoader } from "postprocessing";

/**
 * Loads a .cube LUT from a URL and returns a memoized `LUT3DEffect` instance
 * suitable for direct use as an EffectComposer child via `<primitive object>`.
 *
 * The returned effect's blend-mode opacity is bound to `intensity` (0..1),
 * letting the caller dial the LUT strength without re-loading the file.
 *
 * Pass `null` for `url` to disable — the hook then returns `null` and the
 * caller can omit the effect from the composer entirely.
 */
export function useLUTEffect(
  url: string | null,
  intensity: number
): LUT3DEffect | null {
  const [effect, setEffect] = useState<LUT3DEffect | null>(null);

  useEffect(() => {
    if (!url) {
      setEffect((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }

    let cancelled = false;
    const loader = new LUTCubeLoader();
    loader.load(
      url,
      (texture) => {
        if (cancelled) {
          texture.dispose?.();
          return;
        }
        const fx = new LUT3DEffect(texture);
        setEffect((prev) => {
          prev?.dispose();
          return fx;
        });
      },
      undefined,
      (err) => {
        if (cancelled) return;
        console.error("[useLUTEffect] failed to load LUT:", url, err);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Bind intensity → blendMode.opacity. EffectComposer reads this every
  // frame, so live slider updates show up immediately with no re-mount.
  useEffect(() => {
    if (effect) {
      effect.blendMode.opacity.value = Math.max(0, Math.min(1, intensity));
    }
  }, [effect, intensity]);

  return effect;
}
