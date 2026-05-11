import { useEffect, useState } from "react";
import { GLTFLoader, FBXLoader } from "three-stdlib";
import { AnimationClip, type Object3D } from "three";

export interface OptionalGLTFResult {
  scene: Object3D;
  animations: AnimationClip[];
  /** Source format, for callers that need to apply unit-fixups. */
  format: "glb" | "fbx" | "gltf";
}

/**
 * Load a clip file imperatively from a list of candidate URLs. Tries each
 * URL in order, succeeds on the first that loads, returns `null` if all
 * fail. Supports both `.glb` (GLTFLoader) and `.fbx` (FBXLoader) so users
 * can drop in Mixamo exports of either format.
 *
 * Used for the pose-clip library — each pose id passes a list of likely
 * filename casings + extensions (e.g. `idle.glb`, `Idle.glb`, `Idle.fbx`)
 * and the hook returns whichever the user actually placed in /anim/.
 */
export function useOptionalGLTF(
  candidates: string | string[] | null
): OptionalGLTFResult | null {
  const [result, setResult] = useState<OptionalGLTFResult | null>(null);

  // Stabilize the candidate array as a key so the effect doesn't refire
  // every render.
  const list = candidates == null
    ? []
    : Array.isArray(candidates)
      ? candidates
      : [candidates];
  const key = list.join("|");

  useEffect(() => {
    if (list.length === 0) {
      setResult(null);
      return;
    }
    let cancelled = false;

    async function tryNext(i: number): Promise<void> {
      if (cancelled) return;
      if (i >= list.length) {
        setResult(null);
        return;
      }
      const url = list[i];
      try {
        const loaded = await loadByExt(url);
        if (cancelled) return;
        setResult(loaded);
      } catch {
        // Silent — 404s are expected when probing multiple candidate
        // filenames. Try the next one.
        await tryNext(i + 1);
      }
    }
    tryNext(0);

    return () => {
      cancelled = true;
    };
  }, [key]);

  return result;
}

/**
 * Pick the appropriate loader based on file extension. Returns a uniform
 * shape so callers don't care which format the asset was authored in.
 *
 * - `.glb` / `.gltf` → GLTFLoader. Result has `.scene` + `.animations`.
 * - `.fbx`           → FBXLoader. Result is a Group with `.animations`
 *                       attached as a property — we shape it to match.
 */
function loadByExt(url: string): Promise<OptionalGLTFResult> {
  const lower = url.toLowerCase();
  if (lower.endsWith(".fbx")) {
    return new Promise((resolve, reject) => {
      new FBXLoader().load(
        url,
        (group) => {
          resolve({
            scene: group,
            animations: (group as unknown as { animations: AnimationClip[] })
              .animations ?? [],
            format: "fbx",
          });
        },
        undefined,
        (err) => reject(err)
      );
    });
  }
  // Default to GLTF for .glb/.gltf/anything else.
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) =>
        resolve({
          scene: gltf.scene,
          animations: gltf.animations ?? [],
          format: lower.endsWith(".gltf") ? "gltf" : "glb",
        }),
      undefined,
      (err) => reject(err)
    );
  });
}
