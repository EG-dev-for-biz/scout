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

// ---------------------------------------------------------------------------
// <Precipitation />
// ---------------------------------------------------------------------------
//
// A single instanced-point system that handles rain, drizzle, heavy rain,
// snow, and snowstorm. The particle column is centered on the camera
// every frame so streaks always surround the viewer regardless of where
// the camera dollies.
//
// Why points and not lines? gl_PointCoord lets us draw a streak inside a
// quad per particle, so a single draw call gives us tens of thousands of
// particles. THREE.Line would be one draw call per streak in WebGL —
// catastrophic at the densities a heavy storm needs.
//
// The shader is intentionally minimal:
//   - vertex: positions are offset by wind*time + gravity*time, wrapped
//     into the column volume.
//   - fragment: for rain, a vertical streak via aspect-ratio'd
//     gl_PointCoord; for snow, a soft round dot. We branch via a uniform
//     so both kinds share one material.
//
// Density and fall speed scale with `intensity`. Snow uses a much smaller
// terminal velocity than rain — that's what tells the eye "this is snow".

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

attribute float aSeed;

varying float vAlpha;

void main() {
  // Seed-based unique offset per particle so each gets its own column slot.
  float seed = aSeed;
  vec3 base = vec3(
    (fract(seed * 17.31) - 0.5) * 2.0 * uColumnRadius,
    fract(seed * 7.13) * uColumnHeight,
    (fract(seed * 29.71) - 0.5) * 2.0 * uColumnRadius
  );

  // Time-based fall + wind drift. wrappedY grows monotonically with time
  // (mod h), and worldPos.y below subtracts it from uColumnTopY, so each
  // particle marches DOWN through the column and re-enters at the top.
  float fall = uTime * uFallSpeed;
  float wrappedY = mod(base.y + fall, uColumnHeight);

  // Wind drift in WORLD METERS — particles drift horizontally at the
  // physical wind speed. Over a 70 m column at 28 m/s fall (rain), a
  // particle lives ~2.5 s; a 10 m/s wind moves it ~25 m, which produces
  // the visible slant a viewer expects.
  vec3 windDrift = vec3(uWindEastNorth.x, 0.0, -uWindEastNorth.y) * uTime;
  float wrappedX = mod(base.x + windDrift.x + uColumnRadius, uColumnRadius * 2.0) - uColumnRadius;
  float wrappedZ = mod(base.z + windDrift.z + uColumnRadius, uColumnRadius * 2.0) - uColumnRadius;

  vec3 worldPos = vec3(
    uCenter.x + wrappedX,
    uCenter.y + uColumnTopY - wrappedY,
    uCenter.z + wrappedZ
  );

  // Kill particles beyond uActiveCount so the same buffer can host any
  // density without re-allocating the geometry.
  bool alive = float(gl_VertexID) < uActiveCount;
  if (!alive) {
    // Park outside the visible range; gl_Position.w = 0 lets the GPU cull.
    gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
    vAlpha = 0.0;
    return;
  }

  vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Size attenuated by distance, clamped so close particles don't fill
  // the screen. Rain is a thin streak; snow gets a 2x bump because the
  // round-dot shape reads smaller than a streak of equal pixel count.
  float distAtt = clamp(8.0 / max(1.0, -mvPosition.z), 0.25, 1.5);
  gl_PointSize = uSize * distAtt * (uIsSnow > 0.5 ? 2.0 : 1.0);

  // Fade in/out at the column extents so wrapping is invisible.
  float yNorm = wrappedY / uColumnHeight;
  vAlpha = smoothstep(0.0, 0.1, yNorm) * (1.0 - smoothstep(0.85, 1.0, yNorm));
}
`;

const fragmentShader = /* glsl */ `
uniform float uIsSnow;
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);

  float alpha;
  if (uIsSnow > 0.5) {
    // Round, soft snowflake.
    float r = length(p);
    alpha = smoothstep(0.5, 0.15, r);
  } else {
    // Vertical streak — narrow x band, full y reach. Soft horizontal
    // falloff makes the streak feel like motion blur rather than a bar.
    float xBand = smoothstep(0.18, 0.0, abs(p.x));
    float yFade = 1.0 - smoothstep(0.0, 0.5, abs(p.y));
    alpha = xBand * (0.4 + yFade * 0.6);
  }

  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(uColor, alpha * vAlpha);
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
// roughly 8 m from the camera. With the new distAtt clamp [0.25..1.5],
// close particles reach 1.5x and far particles taper to 0.25x. Tuned so
// "Heavy" rain reads visibly without overpowering the frame.
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

export function Precipitation() {
  const precipitation = useWeatherStore((s) => s.precipitation);
  const wind = useWeatherStore((s) => s.wind);
  const camera = useThree((s) => s.camera);

  const pointsRef = useRef<Points>(null!);

  // Geometry + material live for the entire scene lifetime; we just flip
  // uniforms and `uActiveCount` to swap modes. Avoids GPU re-allocation
  // when the user scrubs between rain/snow.
  const { geometry, material } = useMemo(() => {
    const geo = new BufferGeometry();

    // Positions are entirely shader-derived from `aSeed`; the position
    // attribute just provides a vertex count so we set it to zero.
    geo.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3)
    );

    const seeds = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      // Multi-octave hash spread to minimize visible patterning.
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
        uSize: { value: 45 },
        uColor: { value: [0.78, 0.82, 0.88] },
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

  // Per-frame: advance time, follow the camera, route wind.
  useFrame((_state, delta) => {
    if (precipitation.kind === "none") return;
    material.uniforms.uTime.value += delta;
    (material.uniforms.uCenter.value as Vector3).copy(camera.position);
    const [east, north] = windVelocityEastNorth(wind);
    material.uniforms.uWindEastNorth.value = [east, north];
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
