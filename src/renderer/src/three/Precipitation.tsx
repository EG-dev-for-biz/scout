import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import {
  precipitationParticleCount,
  useWeatherStore,
  windVelocityEastNorth,
  type Precipitation as PrecipKind,
} from "@/state/weatherStore";
import { useTimeStore } from "@/state/timeStore";
import { useAreaStore } from "@/state/areaStore";
import { useCameraStore } from "@/state/cameraStore";
import {
  getSolarPosition,
  solarDirectionVector,
} from "@/utils/solarPosition";

// Re-use a single Vector3 for focus target → camera distance each frame
// instead of allocating a fresh one. Hot path.
const focusTargetTmp = new Vector3();

// ---------------------------------------------------------------------------
// <Precipitation />
// ---------------------------------------------------------------------------
//
// A single instanced-point system that handles rain, drizzle, heavy rain,
// snow, and snowstorm. The particle column is centered on the camera
// every frame so streaks always surround the viewer regardless of where
// the camera dollies.
//
// Beyond the basics, the shader implements four "sophistication" passes:
//
//   1. Variable size + lateral wobble (snow). Each flake gets a per-seed
//      size jitter in [0.5x..2.0x] and a slow sin/cos wander in X/Z so
//      snow stops feeling like a uniform falling grid.
//
//   2. Wind shear + gusting. Real wind is stronger aloft than near
//      ground, and pulses. We scale the wind vector by a Y-dependent
//      shear factor and a low-frequency gust modulator. Particles tilt
//      more as they near the spawn ceiling — same wind setting, far
//      more natural look.
//
//   3. Sun-coupled tint. The view ray's alignment with the sun direction
//      drives a hue mix toward a warm "backlit" tint. Forward-lit
//      particles stay neutral grey; backlit ones glow golden at sunset
//      or warm-white at noon. Pairs with the god rays effect — when
//      god rays + rain are both on, the rays sweep through warmly tinted
//      drops (the Spielberg signature).
//
//   4. DoF-aware bokeh. When the camera's DoF is on, particles outside
//      the focus band render as soft round discs (circles of confusion)
//      instead of streaks/dots, with size that grows linearly with
//      distance from the focal plane and alpha that drops in inverse
//      proportion (preserving total energy). The post-process DoF blur
//      then further blends those discs into the scene. The result: a
//      rain streak in focus stays a streak; an out-of-focus drop reads
//      as the classic round photographic bokeh, not a smeared rectangle.

// Tight column around the camera. A larger box just produces more tiny
// far particles (which look like noise, not weather) and far fewer
// close-up ones — the eye reads rain by the close particles, so dense
// nearby coverage matters more than reach.
const COLUMN_RADIUS = 35; // m — half the side length of the column
const COLUMN_HEIGHT = 70; // m — top - bottom of the spawn box
const COLUMN_TOP_Y = 35; // m above the camera at spawn time

// Sized for the heaviest preset; smaller presets just skip drawing the tail.
const MAX_PARTICLES = 14000;

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uFallSpeed;
uniform vec2 uWindEastNorth;
uniform vec3 uCenter;        // re-centered on camera each frame
uniform float uActiveCount;  // how many particles are alive this frame
uniform float uColumnRadius;
uniform float uColumnHeight;
uniform float uColumnTopY;
uniform float uIsSnow;       // 0 = rain (streak), 1 = snow (round)
uniform float uSize;

// DoF-aware bokeh uniforms. uDofEnabled gates the whole branch; when
// disabled the shader collapses back to the un-defocused rendering so
// there's no per-frame uniform-update churn for the common case.
uniform float uDofEnabled;
uniform float uFocusDistance; // m from camera along view direction
uniform float uFocusHalfRange; // m, half-width of in-focus band

attribute float aSeed;

varying float vAlpha;
varying vec3 vWorldPos;
varying float vCoc;          // circle-of-confusion factor, 0 = sharp

// Hash → uniform random in [0, 1) from a seed-derived float. Different
// multipliers for each output channel so we get decorrelated jitter for
// position, size, wobble phase, etc.
float hash11(float x) {
  return fract(sin(x * 12.9898) * 43758.5453);
}

void main() {
  float seed = aSeed;

  // ---- Spawn position --------------------------------------------------
  vec3 base = vec3(
    (fract(seed * 17.31) - 0.5) * 2.0 * uColumnRadius,
    fract(seed * 7.13) * uColumnHeight,
    (fract(seed * 29.71) - 0.5) * 2.0 * uColumnRadius
  );

  // ---- Falls down through the column ----------------------------------
  // wrappedY grows monotonically with time (mod h); worldPos.y subtracts
  // it from uColumnTopY so each particle marches DOWN and re-enters the
  // top after one period.
  float fall = uTime * uFallSpeed;
  float wrappedY = mod(base.y + fall, uColumnHeight);
  float yNorm = wrappedY / uColumnHeight; // 0 at top, 1 at bottom

  // ---- Wind shear + gust ----------------------------------------------
  // Shear: wind is stronger near the top of the column (where particles
  // spawn) than at ground level. Empirically tilts the column subtly so
  // each streak's direction varies with altitude. Inverted yNorm so the
  // factor is highest at spawn (yNorm=0, particle high) and lowest near
  // the floor.
  float shear = mix(0.4, 1.15, 1.0 - yNorm);
  // Gust: a low-freq sine that nudges wind speed between 0.75x and 1.25x.
  // Phase per-particle is locked across time so the gust is global, not
  // a private wobble.
  float gust = 1.0 + 0.25 * sin(uTime * 0.35);
  vec2 effectiveWind = uWindEastNorth * shear * gust;

  // ---- Horizontal drift -----------------------------------------------
  // Wind in world meters. Scene-local: -Z is north, so the north
  // component of wind flips sign here.
  vec3 windDrift = vec3(effectiveWind.x, 0.0, -effectiveWind.y) * uTime;

  // ---- Snow wobble ----------------------------------------------------
  // Real snowflakes meander as they fall — air pockets, asymmetric
  // shape, etc. Two-axis sinusoids with seed-derived phase + frequency
  // so each flake has a unique trajectory. Amplitude ~0.6 m. Off for
  // rain (streaks should be straight or wind-slanted; wobble looks wrong).
  vec2 wobble = vec2(0.0);
  if (uIsSnow > 0.5) {
    float wobblePhaseX = seed * 31.7;
    float wobblePhaseZ = seed * 47.3;
    float wobbleFreq = 0.5 + hash11(seed * 3.7) * 0.6;
    wobble = vec2(
      sin(uTime * wobbleFreq + wobblePhaseX),
      cos(uTime * wobbleFreq * 0.83 + wobblePhaseZ)
    ) * 0.6;
  }

  // ---- Final world position -------------------------------------------
  float wrappedX = mod(base.x + windDrift.x + wobble.x + uColumnRadius, uColumnRadius * 2.0) - uColumnRadius;
  float wrappedZ = mod(base.z + windDrift.z + wobble.y + uColumnRadius, uColumnRadius * 2.0) - uColumnRadius;

  vec3 worldPos = vec3(
    uCenter.x + wrappedX,
    uCenter.y + uColumnTopY - wrappedY,
    uCenter.z + wrappedZ
  );

  // Kill particles beyond uActiveCount so the same buffer hosts any
  // density without re-allocating.
  bool alive = float(gl_VertexID) < uActiveCount;
  if (!alive) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    vWorldPos = vec3(0.0);
    return;
  }

  vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // ---- Distance + base size ------------------------------------------
  // Rain streaks stay uniform so the column reads as a coherent slant.
  // Snow varies 0.5x..2.0x per flake — single biggest visual upgrade
  // because real snow has wide flake-size variation.
  float viewDist = -mvPosition.z; // positive distance along view
  float distAtt = clamp(8.0 / max(1.0, viewDist), 0.25, 1.5);
  float sizeJitter = uIsSnow > 0.5
    ? mix(0.5, 2.0, hash11(seed * 5.9))
    : 1.0;
  float snowBoost = uIsSnow > 0.5 ? 2.0 : 1.0;
  float baseSize = uSize * distAtt * snowBoost * sizeJitter;

  // ---- DoF circle-of-confusion --------------------------------------
  // Distance from the focal band; zero inside the band, grows linearly
  // outside it. vCoc is normalized to focus-half-range so coc=1 means
  // "one focus-range step out of focus" — the natural unit for an
  // aperture-driven CoC.
  float coc = 0.0;
  if (uDofEnabled > 0.5) {
    float distFromFocus = abs(viewDist - uFocusDistance);
    coc = max(0.0, distFromFocus - uFocusHalfRange) / max(uFocusHalfRange, 0.0001);
  }
  vCoc = coc;

  // When defocused, points enlarge linearly with coc (capped) and dim
  // proportionally so total per-particle energy is preserved across the
  // larger disc. Out-of-focus drops thus look like real photographic
  // bokeh discs rather than over-bright bloomy spots.
  float bokehScale = 1.0 + min(coc, 6.0) * 1.8;
  gl_PointSize = baseSize * bokehScale;

  // ---- Per-particle alpha envelope -----------------------------------
  // Fade in/out at the column extents so wrapping is invisible. Then
  // dim by bokehScale^2 when defocused (area grew by ~scale^2, conserve
  // brightness). Floor at 0.15 of the original so very out-of-focus
  // bokeh stays faintly visible rather than vanishing.
  float fade = smoothstep(0.0, 0.1, yNorm) * (1.0 - smoothstep(0.85, 1.0, yNorm));
  float energyConservation = mix(1.0, 1.0 / (bokehScale * bokehScale), step(0.0001, coc));
  vAlpha = fade * max(energyConservation, 0.15);

  // Expose world position to the fragment shader for sun-coupled tinting.
  vWorldPos = worldPos;
}
`;

const fragmentShader = /* glsl */ `
uniform float uIsSnow;
uniform vec3 uColor;
uniform vec3 uSunTint;       // backlit color (warm white → amber → orange)
uniform vec3 uSunDirection;  // unit vector, world-space, from origin → sun
uniform float uSunCoupling;  // 0..1 — strength of the backlit tint mix
uniform vec3 uCameraPosition;

varying float vAlpha;
varying vec3 vWorldPos;
varying float vCoc;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);

  // ---- Shape ---------------------------------------------------------
  // Three branches:
  //   - Defocused (vCoc > 0.25): render as a soft round bokeh disc with
  //     a slight edge harden — mimics real lens aperture discs. The
  //     post-process DoF blur then blends this further into the scene.
  //   - In-focus snow: same round soft disc, smaller falloff.
  //   - In-focus rain: vertical streak via aspect-ratio'd gl_PointCoord.
  float alpha;
  if (vCoc > 0.25) {
    // Bokeh disc. Slightly harder edge than snow so the disc reads as
    // a defined circle of confusion rather than a hazy blob.
    float r = length(p);
    alpha = smoothstep(0.5, 0.32, r);
  } else if (uIsSnow > 0.5) {
    float r = length(p);
    alpha = smoothstep(0.5, 0.15, r);
  } else {
    // Vertical streak — narrow x band, full y reach.
    float xBand = smoothstep(0.18, 0.0, abs(p.x));
    float yFade = 1.0 - smoothstep(0.0, 0.5, abs(p.y));
    alpha = xBand * (0.4 + yFade * 0.6);
  }

  if (alpha <= 0.001) discard;

  // Sun-coupled tint. The dot of (camera→particle) ray and the sun
  // direction is positive when the particle is between the camera and
  // the sun (backlit). Squared falloff so the tint is concentrated near
  // the sun and doesn't smear the whole hemisphere.
  vec3 viewRay = normalize(vWorldPos - uCameraPosition);
  float backlit = max(0.0, dot(viewRay, normalize(uSunDirection)));
  vec3 tinted = mix(uColor, uSunTint, backlit * backlit * uSunCoupling);

  gl_FragColor = vec4(tinted, alpha * vAlpha);
}
`;

interface KindParams {
  fallSpeed: number;
  size: number;
  color: [number, number, number];
  isSnow: boolean;
  blending: typeof AdditiveBlending | typeof NormalBlending;
}

// Size values are AT 1.0 distAtt — i.e. the base pixel size of a particle
// roughly 8 m from the camera. With the distAtt clamp [0.25..1.5], close
// particles reach 1.5x and far particles taper to 0.25x. Snow then gets
// an additional 0.5x..2.0x per-flake jitter, so the effective range for
// snow is roughly 0.25x..3x — wide enough to look organic.
const KIND_PARAMS: Record<Exclude<PrecipKind, "none">, KindParams> = {
  drizzle: {
    fallSpeed: 18,
    size: 4,
    color: [0.78, 0.82, 0.88],
    isSnow: false,
    blending: AdditiveBlending,
  },
  rain: {
    fallSpeed: 28,
    size: 6,
    color: [0.78, 0.82, 0.88],
    isSnow: false,
    blending: AdditiveBlending,
  },
  heavy: {
    fallSpeed: 38,
    size: 9,
    color: [0.82, 0.86, 0.92],
    isSnow: false,
    blending: AdditiveBlending,
  },
  snow: {
    fallSpeed: 3.5,
    size: 3,
    color: [0.95, 0.95, 0.95],
    isSnow: true,
    blending: NormalBlending,
  },
  snowstorm: {
    fallSpeed: 6,
    size: 4,
    color: [0.95, 0.95, 0.95],
    isSnow: true,
    blending: NormalBlending,
  },
};

// Map sun altitude to a "backlit tint" color. High sun → warm white;
// golden hour → amber; very low → deep orange. Pre-baked rather than
// computed in the shader because it's a slow-changing value (date scrub).
function sunTintForAltitude(altitudeRad: number): [number, number, number] {
  if (altitudeRad < 0) return [0.5, 0.55, 0.7]; // night — cool, never visible anyway
  if (altitudeRad > 0.4) return [1.0, 0.97, 0.9]; // mid-sky → warm white
  if (altitudeRad > 0.15) return [1.0, 0.86, 0.62]; // morning/afternoon → soft amber
  return [1.0, 0.65, 0.35]; // near-horizon → deep orange
}

export function Precipitation() {
  const precipitation = useWeatherStore((s) => s.precipitation);
  const wind = useWeatherStore((s) => s.wind);
  const camera = useThree((s) => s.camera);

  // Sun direction + tint — for the per-frame backlit-tint uniform. The
  // takram path uses real solar position too, so this matches both paths.
  const date = useTimeStore((s) => s.date);
  const center = useAreaStore((s) => s.center);
  const refLat = (center[0].lat + center[1].lat) / 2;
  const refLng = (center[0].lng + center[1].lng) / 2;

  // DoF state — bokeh-aware drops. Mirrors the same focus values the
  // `<DepthOfField>` post pass uses, so the in-focus band on rain
  // matches what the rest of the scene resolves sharply.
  const dofEnabled = useCameraStore((s) => s.dofEnabled);
  const apertureF = useCameraStore((s) => s.apertureF);
  const focusTarget = useCameraStore((s) => s.focusTarget);

  const pointsRef = useRef<Points>(null!);

  // Geometry + material live for the entire scene lifetime; we just flip
  // uniforms and `uActiveCount` to swap modes. Avoids GPU re-allocation
  // when the user scrubs between rain/snow.
  const { geometry, material } = useMemo(() => {
    const geo = new BufferGeometry();

    // Positions are entirely shader-derived from `aSeed`; the position
    // attribute just provides a vertex count.
    geo.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3)
    );

    const seeds = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      seeds[i] = i * 0.12345 + Math.random() * 0.001;
    }
    geo.setAttribute("aSeed", new BufferAttribute(seeds, 1));

    const mat = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFallSpeed: { value: 28 },
        uWindEastNorth: { value: [0, 0] },
        uCenter: { value: new Vector3() },
        uActiveCount: { value: 0 },
        uColumnRadius: { value: COLUMN_RADIUS },
        uColumnHeight: { value: COLUMN_HEIGHT },
        uColumnTopY: { value: COLUMN_TOP_Y },
        uIsSnow: { value: 0 },
        uSize: { value: 6 },
        uColor: { value: [0.78, 0.82, 0.88] },
        uSunTint: { value: [1.0, 0.97, 0.9] },
        uSunDirection: { value: new Vector3(0, 1, 0) },
        // Snow is matte and scatters strongly, so backlit-tint is muted;
        // rain droplets refract and pick up backlight aggressively.
        uSunCoupling: { value: 0.8 },
        uCameraPosition: { value: new Vector3() },
        uDofEnabled: { value: 0 },
        uFocusDistance: { value: 50 },
        uFocusHalfRange: { value: 6 },
      },
    });

    return { geometry: geo, material: mat };
  }, []);

  // Apply kind-specific params when the precipitation type changes.
  useEffect(() => {
    if (precipitation.kind === "none") {
      material.uniforms.uActiveCount.value = 0;
      return;
    }
    const p = KIND_PARAMS[precipitation.kind];
    material.uniforms.uFallSpeed.value = p.fallSpeed;
    material.uniforms.uSize.value = p.size;
    material.uniforms.uColor.value = p.color;
    material.uniforms.uIsSnow.value = p.isSnow ? 1 : 0;
    // Snow's backlit tint is softer than rain's. Refraction through a
    // raindrop is much stronger than scattering through a snowflake.
    material.uniforms.uSunCoupling.value = p.isSnow ? 0.35 : 0.8;
    material.blending = p.blending;
    material.needsUpdate = true;
  }, [precipitation.kind, material]);

  // Active count tracks intensity but is clamped by max buffer size.
  useEffect(() => {
    if (precipitation.kind === "none") {
      material.uniforms.uActiveCount.value = 0;
      return;
    }
    material.uniforms.uActiveCount.value = Math.min(
      MAX_PARTICLES,
      precipitationParticleCount(precipitation)
    );
  }, [precipitation, material]);

  // Per-frame: advance time, follow the camera, route wind + sun + DoF.
  useFrame((_state, delta) => {
    if (precipitation.kind === "none") return;
    material.uniforms.uTime.value += delta;
    (material.uniforms.uCenter.value as Vector3).copy(camera.position);
    (material.uniforms.uCameraPosition.value as Vector3).copy(camera.position);
    const [east, north] = windVelocityEastNorth(wind);
    material.uniforms.uWindEastNorth.value = [east, north];

    // Sun direction + altitude-driven tint. Cheap per-frame call —
    // date may be animated in live mode so we recompute every frame.
    const sun = getSolarPosition(date, refLat, refLng);
    const [sx, sy, sz] = solarDirectionVector(sun);
    (material.uniforms.uSunDirection.value as Vector3).set(sx, sy, sz);
    material.uniforms.uSunTint.value = sunTintForAltitude(sun.altitude);

    // DoF — sync with the <DepthOfField> pass so in-focus rain matches
    // sharply-resolved scene fragments. When focusTarget is null the
    // DepthOfField default is ~50 m in front of the camera; mirror that
    // so the bokeh boundary doesn't snap when the user clears focus.
    material.uniforms.uDofEnabled.value = dofEnabled ? 1 : 0;
    if (dofEnabled) {
      const focusDist = focusTarget
        ? camera.position.distanceTo(
            focusTargetTmp.set(
              focusTarget[0],
              focusTarget[1],
              focusTarget[2]
            )
          )
        : 50;
      material.uniforms.uFocusDistance.value = focusDist;
      // Half-range mirrors the post-process pass: worldFocusRange =
      // max(2, apertureF * 4). Wider aperture (smaller f-number) gives
      // a tighter in-focus band — exactly inverse of physical DoF.
      material.uniforms.uFocusHalfRange.value = Math.max(2, apertureF * 4) / 2;
    }
  });

  // When precipitation is off, mount nothing — saves the draw call.
  if (precipitation.kind === "none") return null;

  return (
    <points
      ref={pointsRef}
      frustumCulled={false}
      userData-skipExport={true}
    >
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </points>
  );
}
