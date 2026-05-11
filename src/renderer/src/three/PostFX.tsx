import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
  Noise,
  HueSaturation,
  BrightnessContrast,
  ColorDepth,
  Pixelation,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Vector2 } from "three";
import { useStyleStore } from "@/state/styleStore";
import { useCinemaStore } from "@/state/cinemaStore";
import { useLUTEffect } from "./useLUTEffect";

/**
 * Renders the active StyleProfile's postFX pipeline.
 *
 * Mounted inside <Canvas>, after all scene contents.
 * EffectComposer handles its own RT lifecycle.
 */
export function PostFX() {
  const fx = useStyleStore((s) => s.active.postFX);
  // Cinema LUT also applies in the legacy (non-atmospheric) render path so
  // toggling atmosphere off doesn't lose the user's cinema grade.
  const lutEnabled = useCinemaStore((s) => s.lutEnabled);
  const lutUrl = useCinemaStore((s) => s.lutUrl);
  const lutIntensity = useCinemaStore((s) => s.lutIntensity);
  const lutEffect = useLUTEffect(lutEnabled ? lutUrl : null, lutIntensity);

  // Disable composer entirely if every effect is off — saves a full
  // additional render pass and keeps the scene at native quality.
  const anyEnabled =
    fx.bloom.enabled ||
    fx.chromaticAberration.enabled ||
    fx.vignette.enabled ||
    fx.noise.enabled ||
    fx.grade.enabled ||
    fx.posterize.enabled ||
    fx.pixelation.enabled ||
    lutEffect != null;

  if (!anyEnabled) return null;

  return (
    <EffectComposer multisampling={2}>
      {/* Color grading: hue/sat first, then brightness/contrast */}
      {fx.grade.enabled ? (
        <HueSaturation hue={fx.grade.hue} saturation={fx.grade.saturation} />
      ) : (
        <></>
      )}
      {fx.grade.enabled ? (
        <BrightnessContrast
          brightness={fx.grade.brightness}
          contrast={fx.grade.contrast}
        />
      ) : (
        <></>
      )}

      {/* Posterize → ColorDepth (limit bits per channel) */}
      {fx.posterize.enabled ? (
        <ColorDepth bits={Math.max(2, Math.round(Math.log2(fx.posterize.levels) * 3))} />
      ) : (
        <></>
      )}

      {/* Pixelation */}
      {fx.pixelation.enabled ? (
        <Pixelation granularity={fx.pixelation.granularity} />
      ) : (
        <></>
      )}

      {/* Bloom — must run on linear color space, before final grading */}
      {fx.bloom.enabled ? (
        <Bloom
          intensity={fx.bloom.intensity}
          luminanceThreshold={fx.bloom.threshold}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
      ) : (
        <></>
      )}

      {/* Chromatic aberration */}
      {fx.chromaticAberration.enabled ? (
        <ChromaticAberration
          offset={
            new Vector2(fx.chromaticAberration.offset, fx.chromaticAberration.offset)
          }
          radialModulation={false}
          modulationOffset={0}
        />
      ) : (
        <></>
      )}

      {/* Vignette — darken corners */}
      {fx.vignette.enabled ? (
        <Vignette
          darkness={fx.vignette.darkness}
          offset={fx.vignette.offset}
          eskil={false}
        />
      ) : (
        <></>
      )}

      {/* Film grain */}
      {fx.noise.enabled ? (
        <Noise opacity={fx.noise.opacity} blendFunction={BlendFunction.OVERLAY} />
      ) : (
        <></>
      )}

      {/* User LUT (.cube). Mounted last so the cinema grade sees the fully
          composited frame; in atmospheric mode the LUT lives BEFORE the
          AGX tonemap, but the legacy path has no explicit tonemap so the
          LUT applies last either way. */}
      {lutEffect ? <primitive object={lutEffect} dispose={null} /> : <></>}
    </EffectComposer>
  );
}
