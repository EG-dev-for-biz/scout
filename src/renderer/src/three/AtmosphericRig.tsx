import { useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  ToneMapping,
  Bloom,
  ChromaticAberration,
  Vignette,
  Noise,
  HueSaturation,
  BrightnessContrast,
  ColorDepth,
  DepthOfField,
  Pixelation,
} from "@react-three/postprocessing";
import { BlendFunction, KernelSize, ToneMappingMode } from "postprocessing";
import type { LensFlareEffect } from "@takram/three-geospatial-effects";
import { HalfFloatType, Matrix4, NoToneMapping, Vector2, Vector3 } from "three";
import {
  Atmosphere,
  Sky,
  Stars,
  AerialPerspective,
  SunLight,
  SkyLight,
  type AtmosphereApi,
} from "@takram/three-atmosphere/r3f";
import { Clouds } from "@takram/three-clouds/r3f";
import {
  LensFlare,
  Dithering,
} from "@takram/three-geospatial-effects/r3f";
import {
  Ellipsoid,
  Geodetic,
  radians,
} from "@takram/three-geospatial";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAreaStore } from "@/state/areaStore";
import { useTimeStore } from "@/state/timeStore";
import { useRenderModeStore } from "@/state/renderModeStore";
import { useStyleStore } from "@/state/styleStore";
import { useCinemaStore } from "@/state/cinemaStore";
import { useViewportStore } from "@/state/viewportStore";
import {
  useCameraStore,
  bokehScaleFromLens,
  fovToFocalLength,
} from "@/state/cameraStore";
import {
  getMoonPosition,
  moonColorForPhase,
  moonDirectionVector,
  moonIntensityFactor,
} from "@/utils/celestialPosition";
import { getSolarPosition } from "@/utils/solarPosition";
import { useLUTEffect } from "./useLUTEffect";

const positionECEF = new Vector3();
const eastVec = new Vector3();
const northVec = new Vector3();
const upVec = new Vector3();

/**
 * Wraps a 3D scene with a physically-based atmosphere from the takram stack:
 *   - <Sky>           — precomputed atmospheric scattering on a screen quad
 *   - <SunLight>      — directional light with sun radiance from LUTs
 *   - <SkyLight>      — irradiance approximation of the sky dome
 *   - <Clouds>        — optional volumetric clouds (medium quality preset)
 *   - <AerialPerspective> — adds transmittance + inscatter on scene fragments
 *
 * Anchors scout3d's local east-north-up plane (X=east, Y=up, Z=-north,
 * meters scaled from refLat/refLng) to a real ECEF point so the atmosphere
 * lookups (sun position, sky inscatter, transmittance) are physically
 * correct for the lat/lng of the current area.
 *
 * Renders ALL post-process effects (atmosphere-native + scout3d's existing
 * style PostFX) inside a single EffectComposer so the renderer never has
 * two composers fighting over the framebuffer.
 *
 * On unmount the previous renderer toneMapping is restored — toggling the
 * atmosphere off therefore leaves the legacy <PostFX>/<Sky drei> path
 * untouched.
 */
export function AtmosphericRig({ children }: { children: ReactNode }) {
  const center = useAreaStore((s) => s.center);
  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;

  const date = useTimeStore((s) => s.date);
  const cloudsEnabled = useTimeStore((s) => s.cloudsEnabled);
  const cloudCoverage = useTimeStore((s) => s.cloudCoverage);
  const lensFlareUserToggle = useTimeStore((s) => s.lensFlareEnabled);
  const lensFlareIntensity = useTimeStore((s) => s.lensFlareIntensity);
  const ditheringEnabled = useTimeStore((s) => s.ditheringEnabled);
  const shadowsEnabled = useTimeStore((s) => s.shadowsEnabled);

  // Cinema toolkit — LUT lives in cinemaStore, anamorphic is derived from
  // the viewport aspect ratio so there's a single source of truth.
  const lutEnabled = useCinemaStore((s) => s.lutEnabled);
  const lutUrl = useCinemaStore((s) => s.lutUrl);
  const lutIntensity = useCinemaStore((s) => s.lutIntensity);
  const anamorphicEnabled = useViewportStore(
    (s) => s.aspectRatio === "anamorphic"
  );

  // Depth of field — physical aperture + focus point. The bokeh scale is
  // derived from the live lens focal length and chosen f-stop so longer
  // lenses + wider apertures (smaller f-numbers) produce shallower DoF, as
  // they would on a real camera.
  const dofEnabled = useCameraStore((s) => s.dofEnabled);
  const apertureF = useCameraStore((s) => s.apertureF);
  const focusTarget = useCameraStore((s) => s.focusTarget);
  const userFovDeg = useCameraStore((s) => s.userFovDeg);
  const focalMM = fovToFocalLength(userFovDeg);
  const bokehScale = bokehScaleFromLens(focalMM, apertureF);
  // World-space focus band width — wider aperture (smaller N) = narrower
  // band, tighter aperture = wider band. Tuned to read naturally on
  // typical scouting distances (10..500 m).
  const worldFocusRange = Math.max(2, apertureF * 4);
  // Anamorphic preset auto-enables lens flare and biases ChromaticAberration
  // and Noise so the rig reads as cinema rather than digital flat.
  const lensFlareEnabled = lensFlareUserToggle || anamorphicEnabled;

  const lutEffect = useLUTEffect(lutEnabled ? lutUrl : null, lutIntensity);

  const renderMode = useRenderModeStore((s) => s.mode);
  // Google's Photorealistic 3D Tiles already bake lighting and aerial
  // perspective into their imagery. Adding our sky inscatter on top
  // double-hazes the result. Run aerial perspective only in OSM mode.
  const showSkyFromAerial = renderMode === "osm";

  // Style-driven post-process pass parameters (Bloom, grade, vignette, etc.)
  // are folded into THIS composer; the standalone <PostFX> component is
  // skipped while atmospheric mode is active.
  const fx = useStyleStore((s) => s.active.postFX);

  // Moon position + phase-tinted lighting. Recomputed when date or center
  // changes; intentionally NOT in a useFrame because moon motion is glacial
  // at scout3d's typical date-scrub resolution (minutes-to-hours) and the
  // astronomy-engine call is cheap but not free.
  const moon = useMemo(
    () => getMoonPosition(date, refLat, refLng),
    [date, refLat, refLng]
  );
  const moonDir = useMemo(() => moonDirectionVector(moon), [moon]);
  const moonColor = useMemo(() => moonColorForPhase(moon), [moon]);
  // Full moon at zenith ~= 1; scale to a small absolute intensity (moonlight
  // is roughly six magnitudes dimmer than sunlight ≈ 1/400,000, but we
  // exaggerate slightly so night shots actually read on screen).
  const moonIntensity = moonIntensityFactor(moon) * 0.6;
  const moonCastsShadow = shadowsEnabled && moonIntensity > 0.08;

  // Twilight / city skyglow lift. Physically the takram SkyLight goes to
  // near-zero at night, leaving the city pitch black. For scouting use
  // that's useless — a film scout wants to see the geometry even at 3 AM.
  // Add a HemisphereLight whose intensity ramps with sun-below-horizon:
  // sun above horizon  → no lift (real physics holds)
  // sun at -6° (civil) → ~25% lift, blue-magenta dusk
  // sun below -12°     → full lift, warm sodium glow simulating city lights
  // Top color is cool blue (sky), bottom is warm amber (street-lamp bounce).
  const sun = useMemo(
    () => getSolarPosition(date, refLat, refLng),
    [date, refLat, refLng]
  );
  const sunBelowHorizonFactor = Math.max(0, -Math.sin(sun.altitude));
  // Smoothly ramp 0..1 as sun drops from 0° to -12°.
  const twilightAmount = Math.min(1, sunBelowHorizonFactor * 5);

  const atmosphereRef = useRef<AtmosphereApi>(null);
  const lensFlareRef = useRef<LensFlareEffect>(null);
  const gl = useThree(({ gl }) => gl);

  // The takram LensFlareEffect ships with KawaseBlurPass at kernelSize SMALL
  // and a low threshold (10) — both contribute to "grainy" flares that
  // drag chromatic bands across foreground buildings. Reach into the effect
  // after mount and:
  //   - crank Kawase pre-blur to HUGE for the softest halo
  //   - raise thresholdLevel a lot (only the sun core triggers the flare,
  //     so bright sky above buildings doesn't seed the chromatic streaks)
  //   - widen thresholdRange so the on/off transition is a smoothstep, not
  //     a hard step (kills the banding edges)
  useEffect(() => {
    const effect = lensFlareRef.current;
    if (!effect) return;
    effect.preBlurPass.kernelSize = KernelSize.HUGE;
    effect.thresholdLevel = 30;
    effect.thresholdRange = 15;
  }, [lensFlareEnabled]);

  // Live-update intensity from the user slider without re-creating the effect.
  useEffect(() => {
    const effect = lensFlareRef.current;
    if (!effect) return;
    effect.intensity = lensFlareIntensity;
  }, [lensFlareIntensity, lensFlareEnabled]);

  // scout3d's local frame: X=east, Y=up, Z=south. project() returns
  // Vector2(east, north) and meshes use position(east, 0, -north).
  // Anchor that frame to a real ECEF point so atmospheric LUT lookups
  // (sun position, sky inscatter, transmittance) are physically correct.
  const worldToECEF = useMemo(() => {
    new Geodetic(radians(refLng), radians(refLat), 0).toECEF(positionECEF);
    Ellipsoid.WGS84.getEastNorthUpVectors(
      positionECEF,
      eastVec,
      northVec,
      upVec
    );
    const south = northVec.clone().multiplyScalar(-1);
    return new Matrix4()
      .makeBasis(eastVec, upVec, south)
      .setPosition(positionECEF);
  }, [refLat, refLng]);

  useEffect(() => {
    atmosphereRef.current?.worldToECEFMatrix.copy(worldToECEF);
  }, [worldToECEF]);

  useFrame(() => {
    atmosphereRef.current?.updateByDate(date);
  });

  // AGX ToneMapping at the end of the composer would double-tonemap if the
  // renderer's tonemap stayed on. Restore on unmount so the legacy path
  // (drei <Sky>, <PostFX>) renders correctly when atmosphere is toggled off.
  useEffect(() => {
    const prev = gl.toneMapping;
    gl.toneMapping = NoToneMapping;
    return () => {
      gl.toneMapping = prev;
    };
  }, [gl]);

  return (
    <Atmosphere ref={atmosphereRef}>
      {/* Sky's ScreenQuad lives in the scene graph; mark it so the
          GLTFExporter in <Export /> drops it instead of serializing the
          atmosphere material. */}
      <Sky userData-skipExport={true} />

      {/* Star field. Reads the same worldToECEFMatrix from the Atmosphere
          context, so the constellations are oriented correctly for the
          chosen lat/lng/date. Auto-fades behind the lit sky during the day —
          no manual day/night toggle needed.
          - data: vendor the binary catalog locally so Electron renderer
            doesn't have to fetch it from GitHub Media's CDN at runtime.
          - intensity: AGX tonemap crushes near-zero luminance to black, so
            real-magnitude star brightness disappears at night. Boost
            substantially so the brightest stars survive the toe of the curve.
          - pointSize: also bumped so individual star sprites are visible at
            normal viewing distance. */}
      <Stars
        userData-skipExport={true}
        data="/atmosphere/stars.bin"
        intensity={20}
        pointSize={2.5}
      />

      {/* Light-source lighting path. SunLight + SkyLight do the actual
          shading on standard/physical materials; AerialPerspective then
          adds atmospheric transmittance + inscatter on top WITHOUT a second
          lighting pass.
          SunLight extends three's DirectionalLight, so castShadow + the
          usual shadow.* props apply. Single-cascade shadow camera tuned for
          a city-block scene; for true 3-cascade CSM the cloud BSM below
          already uses it via shadow-cascadeCount={3}. */}
      <SunLight
        position={[0, 0, 0]}
        distance={5000}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={6000}
        shadow-camera-left={-2500}
        shadow-camera-right={2500}
        shadow-camera-top={2500}
        shadow-camera-bottom={-2500}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
      />
      <SkyLight position={[0, 0, 0]} />

      {/* Twilight / city skyglow. Cool blue sky above, warm sodium below.
          Only on when the sun is below the horizon so daytime physics
          stay pure. Intensity caps low — the goal is "now I can see the
          buildings" not "looks like noon". */}
      <hemisphereLight
        args={["#3a4a6e", "#5a3a1e"]}
        intensity={twilightAmount * 0.6}
        position={[0, 1, 0]}
      />

      {/* Moonlight. Plain directionalLight (takram's SunLight is hard-bound
          to the sun) positioned along the moon's altitude/azimuth vector
          for the scene's lat/lng/date. Phase-tinted color goes from warm
          dim (~#3a2a25 sliver) → cool bright (~#cfd8e8 full moon). Shadows
          only cast when the moon is meaningfully bright AND above horizon,
          so day/twilight scenes aren't muddied by a competing low-quality
          shadow map. */}
      <directionalLight
        position={[moonDir[0] * 4000, moonDir[1] * 4000, moonDir[2] * 4000]}
        color={moonColor}
        intensity={moonIntensity}
        castShadow={moonCastsShadow}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.1}
        shadow-camera-far={6000}
        shadow-camera-left={-2500}
        shadow-camera-right={2500}
        shadow-camera-top={2500}
        shadow-camera-bottom={-2500}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
      />

      {children}

      <EffectComposer
        enableNormalPass
        multisampling={0}
        frameBufferType={HalfFloatType}
      >
        {/* Clouds must composite before AerialPerspective so the
            AerialPerspective effect can consume the cloud overlay/shadow
            buffers via Atmosphere context. */}
        {cloudsEnabled ? (
          <Clouds
            qualityPreset="medium"
            coverage={cloudCoverage}
            shadow-cascadeCount={3}
            shadow-mapSize={[512, 512]}
          />
        ) : (
          <></>
        )}

        {/* Aerial perspective + sky inscatter. `sky` adds extra inscatter
            over the sky background; disable in photoreal/hybrid so we
            don't double-haze Google's pre-lit tiles. */}
        <AerialPerspective sky={showSkyFromAerial} />

        {/* Depth of field — runs in HDR before grading/bloom so the bokeh
            inherits the scene's color science. `target` snaps the focus
            plane to the user's clicked focus point; when null, the effect
            defaults to a point ~50 m in front of the camera (handled by the
            DepthOfField effect itself). */}
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

        {/* Scout3d's style-driven post chain, folded in BETWEEN atmospheric
            inscatter and final tonemap so cinematic grading still applies.
            EffectComposer requires non-null children — use empty fragments
            for disabled effects rather than null. */}
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
        {fx.posterize.enabled ? (
          <ColorDepth
            bits={Math.max(2, Math.round(Math.log2(fx.posterize.levels) * 3))}
          />
        ) : (
          <></>
        )}
        {fx.pixelation.enabled ? (
          <Pixelation granularity={fx.pixelation.granularity} />
        ) : (
          <></>
        )}
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
        {fx.chromaticAberration.enabled || anamorphicEnabled ? (
          <ChromaticAberration
            offset={
              new Vector2(
                // Anamorphic baseline bumps ca slightly horizontally;
                // user-set value wins if already enabled and larger.
                Math.max(
                  fx.chromaticAberration.enabled ? fx.chromaticAberration.offset : 0,
                  anamorphicEnabled ? 0.0012 : 0
                ),
                Math.max(
                  fx.chromaticAberration.enabled ? fx.chromaticAberration.offset : 0,
                  anamorphicEnabled ? 0.0012 : 0
                )
              )
            }
            radialModulation={false}
            modulationOffset={0}
          />
        ) : (
          <></>
        )}
        {fx.vignette.enabled ? (
          <Vignette
            darkness={fx.vignette.darkness}
            offset={fx.vignette.offset}
            eskil={false}
          />
        ) : (
          <></>
        )}
        {fx.noise.enabled || anamorphicEnabled ? (
          <Noise
            opacity={Math.max(
              fx.noise.enabled ? fx.noise.opacity : 0,
              anamorphicEnabled ? 0.04 : 0
            )}
            blendFunction={BlendFunction.OVERLAY}
          />
        ) : (
          <></>
        )}

        {/* User LUT (.cube) — sits AFTER scout3d's algorithmic grade so the
            LUT receives a normalized base, BEFORE LensFlare/Dithering and
            the final AGX tonemap. Three-stage cinematic flow: physical sky
            → algorithmic grade → cinema LUT → tonemap. */}
        {lutEffect ? (
          <primitive object={lutEffect} dispose={null} />
        ) : (
          <></>
        )}

        {lensFlareEnabled ? (
          // resolutionScale defaults to 0.5 (half-res), which produces the
          // visible "pixelated" / blocky lens-flare halos on bright skies.
          // Render at full resolution and grab a ref so the useEffect above
          // can crank the internal Kawase pre-blur kernel up to HUGE — that
          // softens the flare from "stair-stepped block" into a cinematic
          // diffuse glow without losing intensity.
          <LensFlare ref={lensFlareRef} resolutionScale={1.0} />
        ) : (
          <></>
        )}
        {ditheringEnabled ? <Dithering /> : <></>}

        {/* AGX tonemap MUST be last — composer outputs in linear color
            up to this point. */}
        <ToneMapping mode={ToneMappingMode.AGX} />
      </EffectComposer>
    </Atmosphere>
  );
}
