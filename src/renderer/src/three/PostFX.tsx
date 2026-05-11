import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
  Noise,
  HueSaturation,
  BrightnessContrast,
  ColorDepth,
  DepthOfField,
  Pixelation,
  GodRays,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Mesh, Vector2 } from "three";
import { useRef, useMemo } from "react";
import { useStyleStore } from "@/state/styleStore";
import { useCinemaStore } from "@/state/cinemaStore";
import { useWeatherStore } from "@/state/weatherStore";
import { useTimeStore } from "@/state/timeStore";
import { useAreaStore } from "@/state/areaStore";
import {
  useCameraStore,
  bokehScaleFromLens,
  fovToFocalLength,
} from "@/state/cameraStore";
import {
  getSolarPosition,
  solarDirectionVector,
} from "@/utils/solarPosition";
import { useLUTEffect } from "./useLUTEffect";
import { VolumetricFog } from "./VolumetricFog";
import { SunMarker } from "./SunMarker";

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

  // Depth of field (legacy path mirror of AtmosphericRig).
  const dofEnabled = useCameraStore((s) => s.dofEnabled);
  const apertureF = useCameraStore((s) => s.apertureF);
  const focusTarget = useCameraStore((s) => s.focusTarget);
  const userFovDeg = useCameraStore((s) => s.userFovDeg);
  const focalMM = fovToFocalLength(userFovDeg);
  const bokehScale = bokehScaleFromLens(focalMM, apertureF);
  const worldFocusRange = Math.max(2, apertureF * 4);

  // Weather store — new tier-1 atmospheric effects mirrored from
  // AtmosphericRig so they work identically in the legacy render path.
  const fogEnabled = useWeatherStore((s) => s.fog.enabled);
  const hazeEnabled = useWeatherStore((s) => s.haze.enabled);
  const godRaysState = useWeatherStore((s) => s.godRays);

  // Choose the sun source the marker should track. In the legacy path
  // the visible sun disc is whichever drei <Sky> is drawing:
  //   - solar lighting ON  → real astronomical position
  //   - solar lighting OFF → style preset's authored sunPosition
  // Otherwise the god rays would emanate from a position that doesn't
  // line up with the visible sun.
  const date = useTimeStore((s) => s.date);
  const solarLightingEnabled = useTimeStore((s) => s.solarLightingEnabled);
  const center = useAreaStore((s) => s.center);
  const stylePresetSunPos = useStyleStore((s) => s.active.sky.sunPosition);
  const refLat = (center[0].lat + center[1].lat) / 2;
  const refLng = (center[0].lng + center[1].lng) / 2;
  const sun = useMemo(
    () => getSolarPosition(date, refLat, refLng),
    [date, refLat, refLng]
  );
  const sunDirReal = useMemo(() => solarDirectionVector(sun), [sun]);
  // Direction the marker should follow. Memoized so SunMarker doesn't
  // resubscribe each render.
  const sunDirection = useMemo<[number, number, number]>(() => {
    return solarLightingEnabled
      ? sunDirReal
      : (stylePresetSunPos as [number, number, number]);
  }, [solarLightingEnabled, sunDirReal, stylePresetSunPos]);
  // Gate by the marker's own y-component so even style-preset suns
  // below the horizon don't trigger god rays.
  const godRaysActive =
    godRaysState.enabled && sunDirection[1] > 0;

  const sunMarkerRef = useRef<Mesh>(null!);

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
    lutEffect != null ||
    dofEnabled ||
    fogEnabled ||
    hazeEnabled ||
    godRaysActive;

  if (!anyEnabled) return null;

  return (
    <>
      {/* SunMarker lives in the scene tree, OUTSIDE the EffectComposer.
          GodRays reads its depth/silhouette to seed the radial blur.
          In legacy mode we pass the active sun direction explicitly so
          the marker tracks whatever the drei <Sky> disc is showing. */}
      {godRaysActive && (
        <SunMarker ref={sunMarkerRef} direction={sunDirection} />
      )}

      <EffectComposer multisampling={2}>
        {/* Depth of field — first in the chain so bokeh inherits the raw
            scene, before grade/bloom amplify highlights. */}
        {dofEnabled ? (
          <DepthOfField
            target={focusTarget ?? undefined}
            worldFocusRange={worldFocusRange}
            bokehScale={bokehScale}
            height={480}
          />
        ) : (
          <></>
        )}

        {/* Atmospheric medium — same two-instance fog as AtmosphericRig.
            Both gate on store density==0 internally so leaving them
            mounted is cheap. */}
        <VolumetricFog kind="ground" />
        <VolumetricFog kind="haze" />

        {/* God rays — radial blur around the SunMarker. */}
        {godRaysActive ? (
          <GodRays
            sun={sunMarkerRef}
            samples={godRaysState.samples}
            density={godRaysState.density}
            decay={godRaysState.decay}
            weight={godRaysState.weight}
            exposure={godRaysState.exposure}
            blur
          />
        ) : (
          <></>
        )}

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
        {/* Bloom — combines style preset's bloom with a sun-coupled
            boost when god rays are active. See AtmosphericRig.tsx for
            the rationale; mirror of the same logic for legacy parity. */}
        {fx.bloom.enabled || godRaysActive ? (
          <Bloom
            intensity={Math.max(
              fx.bloom.enabled ? fx.bloom.intensity : 0,
              godRaysActive ? 0.8 + godRaysState.exposure * 0.6 : 0
            )}
            luminanceThreshold={Math.min(
              fx.bloom.enabled ? fx.bloom.threshold : 1,
              godRaysActive ? 0.85 : 1
            )}
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
    </>
  );
}
