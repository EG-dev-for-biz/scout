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
  GodRays,
} from "@react-three/postprocessing";
import { BlendFunction, KernelSize, ToneMappingMode } from "postprocessing";
import type { LensFlareEffect } from "@takram/three-geospatial-effects";
import { HalfFloatType, Matrix4, Mesh, NoToneMapping, Vector2, Vector3 } from "three";
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
import { useWeatherStore, windVelocityEastNorth } from "@/state/weatherStore";
import { VolumetricFog } from "./VolumetricFog";
import { SunMarker } from "./SunMarker";
import {
  useCameraStore,
  bokehScaleFromLens,
  fovToFocalLength,
  physicalFocusRange,
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

  // Weather store — drives clouds wind, volumetric fog, god rays.
  // We READ the enable flags here so we can SKIP mounting the
  // VolumetricFog passes entirely when they're off. Keeping all the
  // depth-reading effects mounted simultaneously was producing
  // "Read and write depth stencil attachments cannot be the same image"
  // GL errors in some pipeline orderings — especially when paired with
  // takram's <Clouds>, which also samples scene depth for occlusion.
  // Gating the mounts trims the active depth-attribute Pass count when
  // the user isn't using these features.
  const wind = useWeatherStore((s) => s.wind);
  const fogEnabled = useWeatherStore((s) => s.fog.enabled);
  const hazeEnabled = useWeatherStore((s) => s.haze.enabled);
  const godRaysState = useWeatherStore((s) => s.godRays);
  const sunStrength = useWeatherStore((s) => s.sunStrength);

  // Cloud wind velocity. takram's `localWeatherVelocity` is NOT in m/s
  // — it's in cube-sphere tile-units per second, where one tile is
  // ~100 km wide (default localWeatherRepeat=100 on Earth's ~40,000 km
  // cube-sphere). Multiplying raw m/s by ~1/100,000 gives the physical
  // conversion; we bias slightly faster (1/50,000) since wind aloft is
  // usually stronger than ground wind, and the cinematic look is
  // "clouds drift visibly". With this scale a 10 m/s wind moves the
  // weather texture at 2e-4 tiles/sec ≈ 20 m/sec apparent motion at the
  // tile scale, which reads as gentle drift in a real-time camera.
  const CLOUD_WIND_TILES_PER_MPS = 1 / 50000;
  const cloudWindVel = useMemo(() => {
    const [east, north] = windVelocityEastNorth(wind);
    return new Vector2(
      east * CLOUD_WIND_TILES_PER_MPS,
      north * CLOUD_WIND_TILES_PER_MPS
    );
  }, [wind]);

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
  const cameraSnapshot = useCameraStore((s) => s.current);
  const userFovDeg = useCameraStore((s) => s.userFovDeg);
  const focalMM = fovToFocalLength(userFovDeg);
  const bokehScale = bokehScaleFromLens(focalMM, apertureF);
  // World-space focus band width derived from real DoF math: hyperfocal
  // distance H = f²/(N·c). For wide-to-normal lenses at typical scouting
  // distances, H is small enough that the focus target sits past it →
  // far limit goes to infinity and clouds/horizon stay sharp. For
  // telephotos H is huge, so the band stays narrow and only the subject
  // resolves. This is what makes a 24mm at f/2.4 leave the sky visible
  // while a 200mm at f/2.4 isolates the subject.
  const focusDistanceM = useMemo(() => {
    if (!focusTarget || !cameraSnapshot) return 50; // matches DoF default
    const dx = cameraSnapshot.position[0] - focusTarget[0];
    const dy = cameraSnapshot.position[1] - focusTarget[1];
    const dz = cameraSnapshot.position[2] - focusTarget[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }, [focusTarget, cameraSnapshot]);
  const worldFocusRange = physicalFocusRange(focalMM, apertureF, focusDistanceM);
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

  // God rays gating: enabled flag AND sun above horizon. Without the
  // altitude check the radial blur smears an upside-down bar at night.
  const godRaysActive = godRaysState.enabled && sun.altitude > 0;

  const atmosphereRef = useRef<AtmosphereApi>(null);
  const lensFlareRef = useRef<LensFlareEffect>(null);
  // SunMarker mesh — shared between the marker render and the GodRays
  // effect (which needs the same Mesh as its `sun` prop).
  const sunMarkerRef = useRef<Mesh>(null!);
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

      {/* Sun-strength boost. takram's <SunLight> is physically calibrated
          via the atmospheric LUTs, which is correct but conservative for
          cinematic readability. When `sunStrength > 1` we add a
          supplemental directional light aligned with the real sun
          direction so building facades pick up more visible illumination.
          Color shifts warm as the sun drops so golden-hour boost feels
          natural, not like a studio fill. Only active when the sun is
          above the horizon — below horizon the boost would just light
          the wrong side. */}
      {sunStrength > 1.0 && sun.altitude > 0 ? (() => {
        const r = Math.cos(sun.altitude);
        const sx = r * Math.sin(sun.azimuth);
        const sy = Math.sin(sun.altitude);
        const sz = -r * Math.cos(sun.azimuth);
        const color =
          sun.altitude > 0.26
            ? "#fff5dc"
            : sun.altitude > 0.1
              ? "#ffe0b0"
              : "#ffb070";
        return (
          <directionalLight
            position={[sx * 4000, sy * 4000, sz * 4000]}
            color={color}
            intensity={(sunStrength - 1) * Math.PI * 1.2}
            castShadow={false}
          />
        );
      })() : null}

      {/* Ambient fill that scales with sunStrength so the shadow side of
          objects also reads brighter when the user cranks up the sun.
          Below 1.0 this contributes nothing; above 1.0 it adds a soft
          warm-cool fill that complements the directional boost. */}
      <hemisphereLight
        args={["#c8d4ec", "#a08060"]}
        intensity={Math.max(0, (sunStrength - 1) * 0.35)}
        position={[0, 1, 0]}
      />

      {/* Bounce / radiosity fill. takram's <SkyLight> captures the sky
          dome's contribution to surface irradiance but does NOT model
          inter-surface bounce — the light that bounces off the ground
          and adjacent buildings to fill shadow sides. Without it, the
          atmospheric path renders ~physically correctly but reads as
          unnaturally dark on shadow facets compared to legacy mode
          (which leans on a beefy ambient + a couple of cheat point
          lights). This hemisphere light reintroduces that bounce energy
          cheaply: cool grey from above (sky bounce on rooftops), warm
          tan from below (asphalt / concrete bounce on undersides).
          Intensity tracks sin(altitude) so high-noon scenes get the
          most bounce and dusk/dawn taper to zero — and it scales with
          sunStrength so the user's multiplier brightens fill in lockstep
          with the directional sun. */}
      <hemisphereLight
        args={["#bccae0", "#c8b89c"]}
        intensity={
          Math.max(0, Math.sin(Math.max(0, sun.altitude))) * 0.55 * sunStrength
        }
        position={[0, 1, 0]}
      />

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

      {/* SunMarker — invisible tracking mesh at the sun's altitude/azimuth.
          Needed only when god rays are active. Lives in scene space so
          buildings naturally occlude it for the radial-blur silhouettes. */}
      {godRaysActive && <SunMarker ref={sunMarkerRef} />}

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
            // Wind drift — same vector that powers fog drift and rain
            // slant. localWeatherVelocity is in scene-local east/north m/s.
            localWeatherVelocity={cloudWindVel}
          />
        ) : (
          <></>
        )}

        {/* Aerial perspective + sky inscatter. `sky` adds extra inscatter
            over the sky background; disable in photoreal/hybrid so we
            don't double-haze Google's pre-lit tiles. */}
        <AerialPerspective sky={showSkyFromAerial} />

        {/* Volumetric fog — two instances of the same effect with
            different parameter presets. Ground fog is low and dense;
            haze is tall, thin, and sun-coupled. Conditionally mounted
            so depth-attribute Pass count stays low when the user
            isn't using fog/haze — combined with the takram <Clouds>
            depth sampling, an always-mounted pair caused GL depth
            stencil attachment conflicts. */}
        {fogEnabled ? <VolumetricFog kind="ground" /> : <></>}
        {hazeEnabled ? <VolumetricFog kind="haze" /> : <></>}

        {/* God rays — radial blur around the SunMarker mesh. Gated by
            sun altitude so we don't render an upside-down bar at night.
            The marker is positioned in the scene tree above so it lives
            in the same world space as buildings (which occlude it,
            seeding the silhouettes). */}
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
        {/* Bloom — combines the style preset's bloom with a sun-coupled
            boost when god rays are active. The sun pass on its own is a
            pure screen-space radial smear and doesn't deposit light onto
            surfaces; this bloom picks up the bright sun area + the rays
            and bleeds them outward, which reads as "the sun is
            illuminating the buildings." We use max(style, sun) so a
            style that already has heavy bloom (Cyberpunk) isn't doubled
            up. */}
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
          // Grab a ref so the useEffect above can crank the internal
          // Kawase pre-blur kernel up to HUGE — that softens the flare
          // from a stair-stepped block into a cinematic diffuse glow.
          // Resolution scale stays at the LensFlare default (0.5 / half
          // res); the kernel boost is what masks the half-res aliasing.
          <LensFlare ref={lensFlareRef} />
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
