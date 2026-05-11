import { Effect, EffectAttribute, BlendFunction } from "postprocessing";
import {
  Color,
  Matrix4,
  Uniform,
  Vector2,
  Vector3,
  type Camera,
  type PerspectiveCamera,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";

// ---------------------------------------------------------------------------
// VolumetricFogEffect
// ---------------------------------------------------------------------------
//
// A depth-aware, height-attenuated, wind-driven volumetric fog pass used for
// TWO things with one shader:
//   - "ground" — low-altitude inversion layer (heightTop ~50m).
//   - "haze"   — broad atmospheric haze (heightTop ~8000m), sun-tinted.
//
// Both modes use the same math; the R3F wrapper sets different parameter
// presets. The effect runs in the same EffectComposer as the rest of the
// pipeline, so it inherits HDR color and is correctly tonemapped by the
// final AGX pass.
//
// Implementation notes:
// - EffectAttribute.DEPTH gives us a normalized depth from postprocessing.
//   We linearize it via cameraNearFar (auto-bound), reconstruct view
//   position via the manually-bound inverseProjectionMatrix, then world
//   position via cameraMatrixWorld.
// - Height attenuation is exp(-max(0, y - groundY) / heightFalloff), gated
//   by heightTop. Fragments above heightTop get zero fog.
// - Distance attenuation is exp-fog density over linear depth, so close
//   fragments are crystal clear and distant ones drown in fog.
// - "wind drift" offsets a procedural noise field that subtly modulates
//   density per fragment — gives the medium motion without billowing.
//   Cheap 2D value noise; runs every frame from the auto-incremented
//   `time` uniform.
// - "sun tint" mixes fogColor toward sunTint by the dot of the view ray
//   and the sun direction — fragments looking toward the sun pick up the
//   warm bias, which is the visual signature of atmospheric haze.

const fragmentShader = /* glsl */ `
uniform mat4 uInverseProjectionMatrix;
uniform mat4 uCameraMatrixWorld;
uniform vec3 uSunDirection;     // unit vector, world-space, FROM origin TO sun
uniform vec3 uFogColor;
uniform vec3 uSunTint;
uniform vec2 uWindEastNorth;    // m/s in scene-local east/north
uniform float uDensity;          // peak density at the ground
uniform float uHeightTop;        // top of the fog volume in meters above groundY
uniform float uHeightFalloff;    // exponential falloff scale, meters
uniform float uGroundY;          // world-space y for the bottom of the fog
uniform float uSunCoupling;      // 0..1 — how strongly fragments are sun-tinted
uniform float uMaxFog;           // 0..1 — clamp on the final mix factor
uniform float uTime;             // seconds since mount; drives wind drift

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  // Skip the sky — depth==1.0 means the fragment is at the far plane.
  // The takram <Sky> ScreenQuad writes its color into the framebuffer with
  // depth at the far plane, so leaving it untouched is exactly right.
  if (depth >= 0.999999) {
    outputColor = inputColor;
    return;
  }

  // Reconstruct the linear view-space distance to the fragment.
  float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  float linearDepth = -viewZ; // positive distance in meters

  // Reconstruct world position from depth + UV.
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = uInverseProjectionMatrix * ndc;
  viewPos /= viewPos.w;
  vec3 worldPos = (uCameraMatrixWorld * viewPos).xyz;

  // Height attenuation. exp falloff from the ground reference; cap at
  // heightTop so the layer is bounded.
  float relY = max(0.0, worldPos.y - uGroundY);
  if (relY > uHeightTop) {
    outputColor = inputColor;
    return;
  }
  float heightFactor = exp(-relY / max(uHeightFalloff, 0.001));

  // Wind drift — sample value noise at a slowly-drifting world XZ. Note
  // the sign on Z: scout3d uses -Z = north (Space.tsx project()), so a
  // north-blowing wind moves UVs in -Z, which we encode by negating the
  // northward component when offsetting noise coordinates.
  vec2 driftUV = worldPos.xz * 0.005 + vec2(uWindEastNorth.x, -uWindEastNorth.y) * uTime * 0.01;
  float n = valueNoise(driftUV);
  // Bias noise toward 1.0 so the fog feels uniform with subtle variation,
  // not a noisy mess. Range becomes [0.7..1.0].
  n = 0.7 + n * 0.3;

  // Distance attenuation. Beer-Lambert on density × height factor.
  float density = uDensity * heightFactor * n;
  float t = 1.0 - exp(-density * linearDepth * 0.02);
  t = clamp(t, 0.0, uMaxFog);

  // Sun coupling — view ray from camera to fragment; dot with sun
  // direction picks up positive values when the camera looks "toward"
  // the sun. Modulate sun tint by max(0, dot)^2 for a soft falloff that
  // doesn't smear into the whole half-space.
  vec3 viewRay = normalize(worldPos - cameraPosition);
  float sunDot = max(0.0, dot(viewRay, normalize(uSunDirection)));
  vec3 tinted = mix(uFogColor, uSunTint, sunDot * sunDot * uSunCoupling);

  outputColor = vec4(mix(inputColor.rgb, tinted, t), inputColor.a);
}
`;

export interface VolumetricFogOptions {
  /**
   * "ground" — short, dense, neutral. "haze" — tall, thin, sun-coupled.
   * Currently informational; the R3F wrapper sets values, the effect
   * itself only cares about the uniforms.
   */
  kind?: "ground" | "haze";
  color?: string;
  density?: number;
  heightTop?: number;
  heightFalloff?: number;
  groundY?: number;
  sunTint?: string;
  sunCoupling?: number;
  /** Cap on the final mix amount — 1.0 lets the fog reach pure color. */
  maxFog?: number;
}

export class VolumetricFogEffect extends Effect {
  /** Driven by the R3F wrapper from the live scene. */
  readonly windEastNorth: Vector2;
  readonly sunDirection: Vector3;

  private elapsed = 0;

  constructor(opts: VolumetricFogOptions = {}) {
    const uniforms = new Map<string, Uniform>([
      ["uInverseProjectionMatrix", new Uniform(new Matrix4())],
      ["uCameraMatrixWorld", new Uniform(new Matrix4())],
      ["uSunDirection", new Uniform(new Vector3(0, 1, 0))],
      ["uFogColor", new Uniform(new Color(opts.color ?? "#c8d4e0"))],
      ["uSunTint", new Uniform(new Color(opts.sunTint ?? "#d8c9a6"))],
      ["uWindEastNorth", new Uniform(new Vector2(0, 0))],
      ["uDensity", new Uniform(opts.density ?? 0.35)],
      ["uHeightTop", new Uniform(opts.heightTop ?? 60)],
      ["uHeightFalloff", new Uniform(opts.heightFalloff ?? 18)],
      ["uGroundY", new Uniform(opts.groundY ?? -1.3)],
      ["uSunCoupling", new Uniform(opts.sunCoupling ?? 0)],
      ["uMaxFog", new Uniform(opts.maxFog ?? 0.95)],
      ["uTime", new Uniform(0)],
    ]);

    super("VolumetricFogEffect", fragmentShader, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.NORMAL,
      uniforms,
    });

    // Public refs so callers can mutate vector contents in place each
    // frame without re-creating the uniform.
    this.windEastNorth = uniforms.get("uWindEastNorth")!.value as Vector2;
    this.sunDirection = uniforms.get("uSunDirection")!.value as Vector3;
  }

  // --- live setters -------------------------------------------------------

  setColor(color: string | Color): void {
    const c = this.uniforms.get("uFogColor")!.value as Color;
    if (color instanceof Color) c.copy(color);
    else c.set(color);
  }

  setSunTint(color: string | Color): void {
    const c = this.uniforms.get("uSunTint")!.value as Color;
    if (color instanceof Color) c.copy(color);
    else c.set(color);
  }

  setDensity(v: number): void {
    this.uniforms.get("uDensity")!.value = v;
  }

  setHeightTop(v: number): void {
    this.uniforms.get("uHeightTop")!.value = v;
  }

  setHeightFalloff(v: number): void {
    this.uniforms.get("uHeightFalloff")!.value = v;
  }

  setGroundY(v: number): void {
    this.uniforms.get("uGroundY")!.value = v;
  }

  setSunCoupling(v: number): void {
    this.uniforms.get("uSunCoupling")!.value = v;
  }

  setMaxFog(v: number): void {
    this.uniforms.get("uMaxFog")!.value = v;
  }

  setWind(east: number, north: number): void {
    this.windEastNorth.set(east, north);
  }

  setSunDirection(x: number, y: number, z: number): void {
    this.sunDirection.set(x, y, z);
  }

  // --- per-frame update --------------------------------------------------

  /**
   * Called by EffectPass once per frame. We pull the live camera's
   * world+projection matrices into uniforms and advance the wind-drift
   * timer.
   */
  update(
    _renderer: WebGLRenderer,
    _inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    this.elapsed += deltaTime ?? 0.016;
    this.uniforms.get("uTime")!.value = this.elapsed;
  }

  /**
   * Called by EffectPass with the active camera right after `setSize`
   * and before each render. We don't override the named lifecycle method
   * directly because the public surface in postprocessing v6 funnels
   * camera updates through this hook on the underlying EffectMaterial,
   * so we mutate the uniforms in `update()` instead — but the camera
   * isn't passed to `update`. Solution: the R3F wrapper calls
   * `syncCamera` from useFrame each frame.
   */
  syncCamera(camera: Camera): void {
    const perspective = camera as PerspectiveCamera;
    const invProj = this.uniforms.get("uInverseProjectionMatrix")!.value as Matrix4;
    invProj.copy(perspective.projectionMatrix).invert();

    const worldMat = this.uniforms.get("uCameraMatrixWorld")!.value as Matrix4;
    worldMat.copy(camera.matrixWorld);
  }
}
