import React, { useRef, useEffect, useCallback, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useCarStore } from "@/state/carStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useProjectStore } from "@/state/projectStore";
import { GROUND_Y } from "./Space";

// Vite serves this from src/renderer/public/models/.
const MANNEQUIN_URL = "/models/sb_mannequin.glb";
useGLTF.preload(MANNEQUIN_URL);

/**
 * The player avatar used in drive/walk mode. Renders a humanoid mannequin
 * (scratchbox sb_mannequin) instead of the original orange placeholder box.
 * Movement controls and camera-follow logic are unchanged — only the
 * visual + the human-scale camera offsets are different.
 */
// sb_mannequin.glb is a Mixamo-style rigged skinned mesh. Inspection of the
// GLB's POSITION accessor shows feet at local y = -1.30 m, head top at
// y = +0.42 m, with the model origin sitting near the top of the head.
// Using Box3.setFromObject on a freshly cloned SkinnedMesh returns empty
// bounds before the skeleton has been updated, so the dynamic-bbox approach
// can silently leave the model embedded in the ground. Hardcoding the
// known feet offset is more reliable for this specific asset.
const MANNEQUIN_FEET_LOCAL_Y = -1.3;
const MANNEQUIN_GROUND_BUFFER = 0.05; // 5 cm above the satellite texture

function MannequinModel() {
  const { scene } = useGLTF(MANNEQUIN_URL);
  // useGLTF caches the result globally; clone so multiple instances would
  // each have their own transform graph. Also flag every mesh for shadow
  // casting/receiving so atmospheric SunLight + MoonLight produce a visible
  // shadow under the mannequin on the satellite ground plane.
  const cloned = React.useMemo(() => {
    const c = scene.clone(true);
    c.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  // Lift the inner primitive so the model's feet (at local y = -1.30) land
  // 5 cm above the group's local origin (which sits on the ground plane).
  const footLift = -MANNEQUIN_FEET_LOCAL_Y + MANNEQUIN_GROUND_BUFFER;

  // One-shot probe: after the SkinnedMesh's first render, read its actual
  // world-space bounding box so we can verify feet/head heights against
  // the satellite plane (y=0). Logs once per scene load.
  const primRef = React.useRef<THREE.Object3D>(null);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (!primRef.current) return;
      primRef.current.updateMatrixWorld(true);
      const wb = new THREE.Box3().setFromObject(primRef.current);
      console.log(
        "[Mannequin] world bbox y =",
        wb.min.y.toFixed(3),
        "→",
        wb.max.y.toFixed(3),
        " (satellite plane is at y=0)"
      );
    }, 200);
    return () => clearTimeout(t);
  }, [cloned]);

  // Mannequin is authored facing +Z; rotate 180° so it faces the same way
  // our control logic expects (forward = -Z).
  return (
    <primitive
      ref={primRef}
      object={cloned}
      position={[0, footLift, 0]}
      rotation={[0, Math.PI, 0]}
    />
  );
}

const Car = () => {
  const carRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const { thirdMode, firstPerson, setThirdMode, setFirstPerson } = useCarStore();
  const addPin = useAnnotationStore((s) => s.addPin);
  const markDirty = useProjectStore((s) => s.markDirty);

  const keys = useRef({ w: false, s: false, a: false, d: false });
  const velocity = useRef(0);

  // -------------------------------------------------------------------------
  // Keyboard handlers
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case "w":
          keys.current.w = true;
          break;
        case "s":
          keys.current.s = true;
          break;
        case "a":
          keys.current.a = true;
          break;
        case "d":
          keys.current.d = true;
          break;
        case "escape":
          setThirdMode(false);
          setFirstPerson(false);
          if (document.exitPointerLock) document.exitPointerLock();
          break;

        // V — toggle first-person / third-person within drive mode
        case "v":
          if (thirdMode) setFirstPerson(!firstPerson);
          break;

        // F — drop a Shot pin at current car position
        case "f":
          if (thirdMode && carRef.current) {
            const pos = carRef.current.position;
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            addPin({
              name: "",
              type: "shot",
              position: { x: pos.x, y: pos.y, z: pos.z },
              cameraAngle: { x: camDir.x, y: camDir.y, z: camDir.z },
              description: "Marked from drive-through",
              tags: ["drive-through"],
            });
            markDirty();
          }
          break;

        default:
          break;
      }
    },
    [thirdMode, firstPerson, setThirdMode, setFirstPerson, addPin, markDirty, camera]
  );

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    switch (e.key.toLowerCase()) {
      case "w": keys.current.w = false; break;
      case "s": keys.current.s = false; break;
      case "a": keys.current.a = false; break;
      case "d": keys.current.d = false; break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Pointer lock on click (car mode)
  useEffect(() => {
    if (!thirdMode) return;
    const handleClick = () => {
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
      }
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [thirdMode]);

  // Mouse look
  useEffect(() => {
    if (!thirdMode) return;
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === document.body && carRef.current) {
        carRef.current.rotation.y -= event.movementX * 0.002;
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, [thirdMode]);

  // -------------------------------------------------------------------------
  // Per-frame movement + camera follow
  // -------------------------------------------------------------------------

  useFrame((_state, delta) => {
    if (!carRef.current) return;

    // Movement (per-frame displacement). Tuned for human-scale: roughly
    // 6 m/s top speed (jogging pace) when delta = 1/60, with quick stop.
    const accelerationRate = 0.5;
    const maxSpeed = 6.0;
    const decelerationRate = 2.5;

    if (keys.current.w) {
      velocity.current = Math.min(maxSpeed, velocity.current + accelerationRate * delta);
    } else if (keys.current.s) {
      velocity.current = Math.max(-maxSpeed, velocity.current - accelerationRate * delta);
    } else {
      if (velocity.current > 0) {
        velocity.current = Math.max(0, velocity.current - decelerationRate * delta);
      } else if (velocity.current < 0) {
        velocity.current = Math.min(0, velocity.current + decelerationRate * delta);
      }
    }

    if (keys.current.a) carRef.current.rotation.y += 0.02;
    if (keys.current.d) carRef.current.rotation.y -= 0.02;

    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(carRef.current.quaternion);
    carRef.current.position.addScaledVector(forward, velocity.current);

    if (!thirdMode) return;

    const carPos = carRef.current.position;

    if (firstPerson) {
      // Eye level: ~1.6m above the mannequin's feet. The carRef sits with
      // its origin at the mannequin's feet so this is direct world Y.
      const eyeOffset = new THREE.Vector3(0, 1.6, 0.1);
      eyeOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), carRef.current.rotation.y);
      camera.position.lerp(carPos.clone().add(eyeOffset), 0.2);
      const lookTarget = carPos.clone().add(
        new THREE.Vector3(0, 1.6, -4).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          carRef.current.rotation.y
        )
      );
      camera.lookAt(lookTarget);
    } else {
      // Third-person follow-cam: 1.5m up and 3m behind the mannequin's
      // shoulder, looking down at chest height.
      const offset = new THREE.Vector3(0, 1.5, 3);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), carRef.current.rotation.y);
      camera.position.lerp(carPos.clone().add(offset), 0.1);
      const lookHeight = new THREE.Vector3(0, 1.2, 0);
      camera.lookAt(carPos.clone().add(lookHeight));
    }
  });

  return (
    // Outer group sits ON the shared ground reference so the mannequin's
    // feet (lifted internally by MannequinModel) land 5 cm above the
    // satellite plane regardless of the GROUND_Y value.
    // Note: camera-follow offsets in useFrame() are RELATIVE to this group,
    // so first-person eye-height (1.6 m above the group origin) and
    // third-person height (1.5 m above) automatically track GROUND_Y too.
    <group ref={carRef} position={[0, GROUND_Y, 0]}>
      <Suspense fallback={null}>
        <MannequinModel />
      </Suspense>
    </group>
  );
};

export default Car;
