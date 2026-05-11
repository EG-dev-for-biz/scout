import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";

/**
 * Replaces the procedural <Sky> with an AI-painted equirectangular panorama
 * when paintedSceneStore.skyTexture is set.
 *
 * Mounted inside <Canvas>. Sets scene.background AND scene.environment so
 * building materials reflect the painted sky (IBL).
 *
 * When the painted texture is cleared, restores defaults so the regular
 * <Sky> + <Environment preset> in Space.tsx take over again.
 */
export function PaintedSky() {
  const { scene } = useThree();
  const skyTexture = usePaintedSceneStore((s) => s.skyTexture);

  useEffect(() => {
    if (!skyTexture) {
      // Restore defaults — Space.tsx's drei <Sky> + <Environment> will paint
      // the scene as before.
      scene.background = null;
      scene.environment = null;
      return;
    }

    let cancelled = false;
    let installedTex: THREE.Texture | null = null;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const tex = new THREE.Texture(img);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      installedTex = tex;

      const prevBg = scene.background as THREE.Texture | null;
      const prevEnv = scene.environment;
      scene.background = tex;
      scene.environment = tex;
      // Dispose previous textures we set (skip if it's not ours)
      if (prevBg && prevBg !== tex) prevBg.dispose?.();
      if (prevEnv && prevEnv !== tex && prevEnv !== prevBg) prevEnv.dispose?.();
    };
    img.onerror = (err) => console.error("[PaintedSky] image load failed", err);
    img.src = skyTexture;

    return () => {
      cancelled = true;
      // CRITICAL: when this component unmounts (e.g. Unpaint clears the
      // painted sky, or atmospheric rig takes over the canvas) we must
      // restore scene.background/environment to null, otherwise the painted
      // equirect texture stays installed on the live Three.js scene even
      // though the React tree no longer renders <PaintedSky>.
      if (scene.background === installedTex) scene.background = null;
      if (scene.environment === installedTex) scene.environment = null;
      installedTex?.dispose?.();
    };
  }, [skyTexture, scene]);

  return null;
}
