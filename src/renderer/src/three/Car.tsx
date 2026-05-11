import React, { useRef, useEffect, useCallback, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { useCarStore } from "@/state/carStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useProjectStore } from "@/state/projectStore";
import {
  usePoseStore,
  LOCOMOTION_POSES,
  SCOUT_POSES,
  EXTRA_POSES,
} from "@/state/poseStore";
import { useOptionalGLTF } from "./useOptionalGLTF";
import { GROUND_Y } from "./Space";

// Vite serves this from src/renderer/public/models/.
const MANNEQUIN_URL = "/models/sb_mannequin.glb";
useGLTF.preload(MANNEQUIN_URL);

// sb_mannequin.glb is a Mixamo-style rigged skinned mesh. Inspection of the
// GLB's POSITION accessor shows feet at local y = -1.30 m, head top at
// y = +0.42 m, with the model origin sitting near the top of the head.
// Hardcoding the known feet offset is more reliable than reading bbox.
const MANNEQUIN_FEET_LOCAL_Y = -1.3;
const MANNEQUIN_GROUND_BUFFER = 0.05;

// All pose ids we'll probe. Locomotion is auto-driven by velocity; the rest
// are user-selectable when not in drive mode. Each maps to /anim/{id}.glb.
const ALL_POSE_IDS = [
  ...LOCOMOTION_POSES.map((p) => p.id),
  ...SCOUT_POSES.map((p) => p.id),
  ...EXTRA_POSES.map((p) => p.id),
];

// Locomotion velocity bands (m/s, against carStore's max ~6 m/s).
// Anything below 0.1 → idle; below 2.5 → walk; below 4.5 → jog; else run.
function locomotionForSpeed(speed: number): string {
  const s = Math.abs(speed);
  if (s < 0.1) return "idle";
  if (s < 2.5) return "walk";
  if (s < 4.5) return "jog";
  return "run";
}

interface LoadedClip {
  id: string;
  clip: THREE.AnimationClip;
}

/**
 * Probe a single pose GLB. Returns the renamed clip (so it can be addressed
 * by id) or null when the file is missing.
 */
function useProbedClip(id: string): LoadedClip | null {
  const result = useOptionalGLTF(`/anim/${id}.glb`);
  if (!result || result.animations.length === 0) return null;
  // Take the first clip from the file and rename it so the mixer can look
  // it up by our internal id rather than the Mixamo export name.
  const clip = result.animations[0].clone();
  clip.name = id;
  return { id, clip };
}

function MannequinModel() {
  const { scene } = useGLTF(MANNEQUIN_URL);

  // Clone using SkeletonUtils so the SkinnedMesh's bone references point at
  // the CLONED bones in this subtree, not the original cached scene's bones.
  // Plain Object3D.clone() leaves the SkinnedMesh referencing the original
  // skeleton — any animation applied to the cloned bones would be ignored.
  const cloned = React.useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    c.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        // SkinnedMesh frustum culling uses the bind-pose bounds which can be
        // tight enough that a moving animation pushes vertices off-screen
        // logically. Disable to be safe — the mannequin is one mesh, so
        // skipping culling has negligible perf cost.
        m.frustumCulled = false;
      }
    });
    return c;
  }, [scene]);

  // Probe every potential clip file. Hooks-rules require fixed call order,
  // so we map over the static ALL_POSE_IDS list. Missing files return null
  // gracefully.
  const loadedClips: (LoadedClip | null)[] = ALL_POSE_IDS.map((id) =>
    useProbedClip(id)
  );

  // Push the available pose-ids to the store so the PosePicker UI can show
  // only what actually loaded. Recompute only when the set changes.
  const setAvailableIds = usePoseStore((s) => s.setAvailableIds);
  const availableKey = loadedClips
    .map((c, i) => (c ? ALL_POSE_IDS[i] : ""))
    .join(",");
  React.useEffect(() => {
    const ids = loadedClips.filter((c): c is LoadedClip => c != null).map(
      (c) => c.id
    );
    setAvailableIds(ids);
  }, [availableKey, setAvailableIds]);

  // Build a single AnimationMixer for the cloned root + attach each loaded
  // clip as an AnimationAction we can fade in/out.
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});

  React.useEffect(() => {
    const mixer = new THREE.AnimationMixer(cloned);
    mixerRef.current = mixer;
    const map: Record<string, THREE.AnimationAction> = {};
    for (const c of loadedClips) {
      if (!c) continue;
      const action = mixer.clipAction(c.clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.play();
      map[c.id] = action;
    }
    actionsRef.current = map;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [cloned, availableKey]);

  // Subscribe to motion + pose state. Each frame we choose the right action
  // and crossfade other actions to weight 0.
  const velocityMS = useCarStore((s) => s.velocityMS);
  const thirdMode = useCarStore((s) => s.thirdMode);
  const activePose = usePoseStore((s) => s.activePose);

  // Currently active clip id (the one fading to weight 1).
  const activeIdRef = useRef<string | null>(null);

  useFrame((_state, delta) => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    mixer.update(delta);

    // Decide target clip: in drive mode the velocity picks locomotion;
    // outside drive mode the user-selected pose plays.
    const target = thirdMode
      ? locomotionForSpeed(velocityMS)
      : activePose;

    // Fade weights: target → 1, everything else → 0, both with a soft ramp.
    const FADE_PER_SEC = 4; // ~0.25s crossfade
    const actions = actionsRef.current;
    for (const id of Object.keys(actions)) {
      const a = actions[id];
      const targetWeight = id === target ? 1 : 0;
      const w = a.getEffectiveWeight();
      const next = THREE.MathUtils.damp(w, targetWeight, FADE_PER_SEC, delta);
      a.setEffectiveWeight(next);
      // For reverse motion, play the clip backwards.
      if (id === target) {
        a.timeScale = velocityMS < -0.1 && thirdMode ? -1 : 1;
      }
    }

    activeIdRef.current = target;
  });

  // Lift the inner primitive so the model's feet (at local y = -1.30) land
  // 5 cm above the group's local origin (which sits on GROUND_Y in Car).
  const footLift = -MANNEQUIN_FEET_LOCAL_Y + MANNEQUIN_GROUND_BUFFER;

  // Mannequin is authored facing +Z; rotate 180° so forward = -Z.
  return (
    <primitive
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
  const setVelocity = useCarStore((s) => s.setVelocity);
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

        case "v":
          if (thirdMode) setFirstPerson(!firstPerson);
          break;

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
  // Per-frame movement + camera follow + velocity publishing
  // -------------------------------------------------------------------------

  useFrame((_state, delta) => {
    if (!carRef.current) return;

    // Movement (per-frame displacement). Tuned for human-scale: roughly
    // 6 m/s top speed (jogging pace), with quick stop.
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

    // Publish velocity → carStore so MannequinModel can pick the
    // appropriate locomotion clip via velocity bands.
    setVelocity(velocity.current, Math.min(1, Math.abs(velocity.current) / maxSpeed));

    if (!thirdMode) return;

    const carPos = carRef.current.position;

    if (firstPerson) {
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
    <group ref={carRef} position={[0, GROUND_Y, 0]}>
      <Suspense fallback={null}>
        <MannequinModel />
      </Suspense>
    </group>
  );
};

export default Car;
