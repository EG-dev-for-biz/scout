import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { usePaintedSceneStore } from "@/state/paintedSceneStore";

const MAX_VIEWS = 4;

/**
 * Returns a custom material with multi-view projective texturing — or null
 * if no views have been painted yet (caller falls back to standard material).
 *
 * Up to 4 painted screenshots, each with its own captured camera matrix,
 * are projected onto building meshes. For each fragment we:
 *   1. Project world position through every captured viewProj matrix
 *   2. Sample painted texture if UV is in bounds + in front of camera
 *   3. Weight each sample by alignment between face normal and that camera's
 *      direction (max(0, dot)^2)
 *   4. Final color = sum(samples * weights) / sum(weights)
 *   5. If no view contributes, fall back to the auto-derived palette base.
 *
 * Result: faces facing the painted angles look painted; faces in between
 * smoothly blend; faces away from all views show the harmonized base color.
 */
export function useProjectedBuildingMaterial(args: {
  baseColor: string;
  emissive: string;
  emissiveIntensity: number;
  /**
   * Optional single per-building override view. When provided, this view is
   * used INSTEAD of the shared multi-view set — the painted texture lands
   * only on the wall that was actually captured (no smear onto other faces).
   */
  perBuildingView?: {
    imageDataUrl: string;
    viewProjMatrix: number[];
    cameraPos: [number, number, number];
  } | null;
  /**
   * AI-painted ground texture as a data URL. When present, top-facing
   * fragments (normal.y > 0.85) sample from this instead of the projection
   * shader — using the building's world XZ → ground UV. Result: every
   * building's rooftop reads the painted-aerial pixels exactly above where
   * the building sits.
   */
  groundTextureUrl?: string | null;
  /** Scene plane width in meters (longitude span). */
  groundWidth?: number;
  /** Scene plane height in meters (latitude span). */
  groundHeight?: number;
}): THREE.Material | null {
  const sharedViews = usePaintedSceneStore((s) => s.buildingsPaintedViews);

  // Per-building override takes precedence — single view, single texture.
  const views = args.perBuildingView
    ? [args.perBuildingView]
    : sharedViews;
  const viewCount = views.length;

  // Ground texture for rooftop sampling
  const groundTex = useMemo(() => {
    if (!args.groundTextureUrl) return null;
    const t = new THREE.Texture();
    const img = new Image();
    img.onload = () => {
      t.image = img;
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
    };
    img.src = args.groundTextureUrl;
    return t;
  }, [args.groundTextureUrl]);

  // Load each painted dataURL into a Three.js Texture
  const textures = useMemo(() => {
    if (viewCount === 0) return null;
    return views.map((v) => {
      const t = new THREE.Texture();
      const img = new Image();
      img.onload = () => {
        t.image = img;
        t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.needsUpdate = true;
      };
      img.src = v.imageDataUrl;
      return t;
    });
  }, [
    // Re-derive only when the array of dataURLs changes
    views.map((v) => v.imageDataUrl).join("|"),
  ]);

  const material = useMemo(() => {
    // We can have just a ground texture, just views, or both. Material always
    // mounts when at least ONE source is available — the shader picks which.
    if (!textures && !groundTex) return null;

    // Pad to MAX_VIEWS — unused slots get a 1×1 dummy texture and identity matrix.
    const dummy = new THREE.Texture();
    const padTextures: THREE.Texture[] = [];
    const padViewProjs: THREE.Matrix4[] = [];
    const padCamPositions: THREE.Vector3[] = [];

    for (let i = 0; i < MAX_VIEWS; i++) {
      if (textures && i < viewCount) {
        padTextures.push(textures[i]);
        padViewProjs.push(new THREE.Matrix4().fromArray(views[i].viewProjMatrix));
        padCamPositions.push(new THREE.Vector3(...views[i].cameraPos));
      } else {
        padTextures.push(dummy);
        padViewProjs.push(new THREE.Matrix4());
        padCamPositions.push(new THREE.Vector3());
      }
    }

    const m = new THREE.ShaderMaterial({
      uniforms: {
        uViewCount: { value: viewCount },
        uPaintedTex0: { value: padTextures[0] },
        uPaintedTex1: { value: padTextures[1] },
        uPaintedTex2: { value: padTextures[2] },
        uPaintedTex3: { value: padTextures[3] },
        uViewProj: { value: padViewProjs },
        uCameraPos: { value: padCamPositions },
        uBaseColor: { value: new THREE.Color(args.baseColor) },
        uEmissive: { value: new THREE.Color(args.emissive) },
        uEmissiveIntensity: { value: args.emissiveIntensity },
        // Painted-ground rooftop sampling
        uGroundTex: { value: groundTex ?? new THREE.Texture() },
        uHasGround: { value: groundTex ? 1 : 0 },
        uGroundWidth: { value: args.groundWidth ?? 0 },
        uGroundHeight: { value: args.groundHeight ?? 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });

    return m;
  }, [
    textures,
    viewCount,
    views.map((v) => v.viewProjMatrix.join(",")).join("|"),
    groundTex,
    args.groundWidth,
    args.groundHeight,
    args.baseColor,
    args.emissive,
    args.emissiveIntensity,
  ]);

  // Cleanup
  useEffect(() => {
    return () => {
      textures?.forEach((t) => t.dispose());
      groundTex?.dispose();
      material?.dispose();
    };
  }, [textures, groundTex, material]);

  return material;
}

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform int uViewCount;
  uniform sampler2D uPaintedTex0;
  uniform sampler2D uPaintedTex1;
  uniform sampler2D uPaintedTex2;
  uniform sampler2D uPaintedTex3;
  uniform mat4 uViewProj[4];
  uniform vec3 uCameraPos[4];
  uniform vec3 uBaseColor;
  uniform vec3 uEmissive;
  uniform float uEmissiveIntensity;
  // Painted aerial ground sampling for rooftops.
  uniform sampler2D uGroundTex;
  uniform int uHasGround;
  uniform float uGroundWidth;
  uniform float uGroundHeight;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  vec4 sampleAt(int i, vec2 uv) {
    if (i == 0) return texture2D(uPaintedTex0, uv);
    if (i == 1) return texture2D(uPaintedTex1, uv);
    if (i == 2) return texture2D(uPaintedTex2, uv);
    return texture2D(uPaintedTex3, uv);
  }

  /**
   * Tries to sample view i. Returns true + sets out_color if the view is
   * valid (in front of camera, in bounds, face roughly faces it).
   * Also returns the alignment score so the caller can pick the winner.
   */
  bool tryView(int i, out vec3 out_color, out float out_score) {
    out_color = vec3(0.0);
    out_score = -1.0;
    if (i >= uViewCount) return false;

    vec4 clip = uViewProj[i] * vec4(vWorldPos, 1.0);
    if (clip.w <= 0.0) return false;
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return false;

    vec3 toCam = normalize(uCameraPos[i] - vWorldPos);
    float facing = dot(vWorldNormal, toCam);
    if (facing <= 0.1) return false; // tighter threshold than blend version

    out_color = sampleAt(i, uv).rgb;
    out_score = facing;
    return true;
  }

  /**
   * Sample the painted-ground texture at this fragment's world XZ position.
   * Returns the painted-aerial pixel of whatever painted ground sits exactly
   * above where this fragment is (which for a rooftop is the building's own
   * AI-painted aerial-view pixels).
   *
   * UV convention matches SatelliteGround.tsx:
   *   plane is centered at origin, sized (W, H), rotated -π/2 on X
   *   UV (0, 1) at NW corner; UV (1, 0) at SE corner.
   *
   * For world (x, z): U = 0.5 + x/W, V = 0.5 - z/H.
   */
  vec3 sampleGroundAtWorldXZ() {
    float u = 0.5 + vWorldPos.x / uGroundWidth;
    float v = 0.5 - vWorldPos.z / uGroundHeight;
    if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) return uBaseColor;
    return texture2D(uGroundTex, vec2(u, v)).rgb;
  }

  void main() {
    // ROOFTOPS: when the surface points up AND we have a painted ground,
    // sample directly from the painted aerial. The pixels of each building's
    // rooftop are exactly the painted-ground pixels above where it sits —
    // perfect per-building rooftop styling for free (no extra Gemini call).
    bool isTopFace = vWorldNormal.y > 0.85;
    if (isTopFace && uHasGround == 1 && uGroundWidth > 0.0 && uGroundHeight > 0.0) {
      vec3 roof = sampleGroundAtWorldXZ();
      gl_FragColor = vec4(roof + uEmissive * uEmissiveIntensity, 1.0);
      return;
    }

    // SIDE FACES: WINNER-TAKE-ALL projective sampling from cardinal/per-building
    // captures. Each face cleanly samples from the view that perpendicularly
    // faces it — painted features land on the correct wall.
    vec3 bestColor = uBaseColor;
    float bestScore = 0.0;
    bool found = false;

    vec3 c; float s;
    if (tryView(0, c, s) && s > bestScore) { bestColor = c; bestScore = s; found = true; }
    if (tryView(1, c, s) && s > bestScore) { bestColor = c; bestScore = s; found = true; }
    if (tryView(2, c, s) && s > bestScore) { bestColor = c; bestScore = s; found = true; }
    if (tryView(3, c, s) && s > bestScore) { bestColor = c; bestScore = s; found = true; }

    vec3 final;
    if (found) {
      final = mix(uBaseColor * 0.5, bestColor, 0.95);
    } else {
      final = uBaseColor;
    }

    final += uEmissive * uEmissiveIntensity;
    gl_FragColor = vec4(final, 1.0);
  }
`;
