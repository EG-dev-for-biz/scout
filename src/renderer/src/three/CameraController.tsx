import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useCameraStore, CameraSnapshot } from "@/state/cameraStore";

/**
 * Lives inside <Canvas>. Replaces the bare <OrbitControls /> we used to render
 * inside Car.tsx — it does three jobs:
 *
 *   1. Renders OrbitControls when not in drive (third-person car) mode.
 *   2. Continuously publishes the active camera position/target/fov to
 *      `useCameraStore.current` so external UI (Capture Shot button) can
 *      snapshot the framing at any moment.
 *   3. When `useCameraStore.framingTarget` is set (by "Frame this shot"),
 *      smoothly tweens the camera + controls target toward that snapshot
 *      over ~0.6s and clears the request.
 */
export function CameraController({ active }: { active: boolean }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const setCurrent = useCameraStore((s) => s.setCurrent);
  const framingTarget = useCameraStore((s) => s.framingTarget);
  const clearFraming = useCameraStore((s) => s.clearFraming);
  const userFovDeg = useCameraStore((s) => s.userFovDeg);

  // Tween state for "Frame this shot"
  const tweenRef = useRef<{
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTgt: THREE.Vector3;
    toTgt: THREE.Vector3;
    fromFov: number;
    toFov: number;
    startMs: number;
    durMs: number;
  } | null>(null);

  // Trigger a new tween when framingTarget arrives
  useEffect(() => {
    if (!framingTarget) return;
    const persp = camera as THREE.PerspectiveCamera;
    const target = controlsRef.current?.target.clone() ?? new THREE.Vector3();

    tweenRef.current = {
      fromPos: persp.position.clone(),
      toPos: new THREE.Vector3(...framingTarget.position),
      fromTgt: target,
      toTgt: new THREE.Vector3(...framingTarget.target),
      fromFov: persp.fov,
      toFov: framingTarget.fov,
      startMs: performance.now(),
      durMs: 700,
    };
    clearFraming();
  }, [framingTarget, camera, clearFraming]);

  useFrame(() => {
    const persp = camera as THREE.PerspectiveCamera;

    // Apply ongoing tween if any
    const t = tweenRef.current;
    if (t) {
      const now = performance.now();
      const u = Math.min(1, (now - t.startMs) / t.durMs);
      const eased = easeInOutCubic(u);

      persp.position.lerpVectors(t.fromPos, t.toPos, eased);
      const newTarget = new THREE.Vector3().lerpVectors(t.fromTgt, t.toTgt, eased);
      persp.fov = t.fromFov + (t.toFov - t.fromFov) * eased;
      persp.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.copy(newTarget);
        controlsRef.current.update();
      } else {
        persp.lookAt(newTarget);
      }

      if (u >= 1) {
        tweenRef.current = null;
      }
    } else {
      // No framing tween active — settle camera.fov toward the user-chosen
      // lens FOV. Critically damped lerp gives a soft ~250ms ease without
      // overshoot when the user picks a new lens preset.
      const fovDiff = userFovDeg - persp.fov;
      if (Math.abs(fovDiff) > 0.01) {
        persp.fov = persp.fov + fovDiff * 0.18;
        persp.updateProjectionMatrix();
      }
    }

    // Publish current snapshot to the store (cheap — only fires if changed)
    const tgt = controlsRef.current?.target ?? new THREE.Vector3();
    const snapshot: CameraSnapshot = {
      position: [persp.position.x, persp.position.y, persp.position.z],
      target: [tgt.x, tgt.y, tgt.z],
      fov: persp.fov,
    };
    setCurrent(snapshot);
  });

  if (!active) return null;
  return <OrbitControls ref={controlsRef} makeDefault />;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
