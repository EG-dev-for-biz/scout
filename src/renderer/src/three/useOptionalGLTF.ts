import { useEffect, useState } from "react";
import { GLTFLoader } from "three-stdlib";
import type { AnimationClip, Object3D } from "three";

export interface OptionalGLTFResult {
  scene: Object3D;
  animations: AnimationClip[];
}

/**
 * Load a GLTF file imperatively. Returns `null` if the file is missing or
 * fails to parse, instead of throwing — so the caller can probe a list of
 * "optional" clip files (idle/walk/run/poses) without crashing the canvas
 * on a 404.
 *
 * We deliberately do NOT use drei's `useGLTF` here because it suspends the
 * tree on load and throws on failure — both undesirable behaviors when we
 * want optional probing of a clip library.
 */
export function useOptionalGLTF(url: string | null): OptionalGLTFResult | null {
  const [result, setResult] = useState<OptionalGLTFResult | null>(null);

  useEffect(() => {
    if (!url) {
      setResult(null);
      return;
    }
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        setResult({ scene: gltf.scene, animations: gltf.animations ?? [] });
      },
      undefined,
      (err) => {
        if (cancelled) return;
        // 404s are expected — only warn once per URL so the console doesn't
        // get flooded if the user runs without dropping in clip files.
        console.warn(`[useOptionalGLTF] ${url}: ${(err as Error).message}`);
        setResult(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  return result;
}
