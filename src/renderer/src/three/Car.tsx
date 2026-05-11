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
import { MannequinPopup } from "@/components/MannequinPopup";

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
// are user-selectable when not in drive mode.
const ALL_POSE_IDS = [
  ...LOCOMOTION_POSES.map((p) => p.id),
  ...SCOUT_POSES.map((p) => p.id),
  ...EXTRA_POSES.map((p) => p.id),
];

/**
 * Per-pose candidate filename basenames. The probe tries each variant in
 * order with both `.glb` and `.fbx` extensions so users can drop Mixamo
 * exports without renaming. First file that loads wins.
 */
const POSE_FILENAME_BASES: Record<string, string[]> = {
  idle: ["idle", "Idle"],
  walk: ["walk", "Walk", "Walking"],
  jog: ["jog", "Jog", "Jogging", "JogForward", "Jog_Forward"],
  run: ["run", "Run", "Running"],
  sit: ["sit", "Sit", "Sitting", "SittingIdle"],
  handsOnHips: [
    "handsOnHips",
    "HandsOnHips",
    "HandsonHips",
    "Hands_On_Hips",
    "hands_on_hips",
  ],
  lookAround: ["lookAround", "LookAround", "Look_Around", "looking_around"],
  phone: ["phone", "Phone", "PhoneCall", "Phone_Call", "TalkingOnThePhone"],
  talk: ["talk", "Talk", "Talking"],
  crouch: ["crouch", "Crouch", "Crouching", "CrouchIdle"],
  leanWall: ["leanWall", "LeanWall", "Leaning", "Lean", "LeaningAgainstWall"],
  walkCircle: [
    "walkCircle",
    "WalkCircle",
    "WalkingInCircle",
    "Walking_In_Circle",
  ],
};

const EXTENSIONS = [".glb", ".fbx", ".gltf"];

function buildCandidates(id: string): string[] {
  const bases = POSE_FILENAME_BASES[id] ?? [id];
  const urls: string[] = [];
  for (const b of bases) {
    for (const e of EXTENSIONS) {
      urls.push(`/anim/${b}${e}`);
    }
  }
  return urls;
}

// Locomotion velocity bands (m/s, against carStore's max ~6 m/s).
// Anything below 0.1 → idle; below 2.5 → walk; below 4.5 → jog; else run.
function locomotionForSpeed(speed: number): string {
  const s = Math.abs(speed);
  if (s < 0.1) return "idle";
  if (s < 2.5) return "walk";
  if (s < 4.5) return "jog";
  return "run";
}

/**
 * True if any AnimationAction is currently contributing (effective weight
 * > 1%). Used so we only restore the head bone's bind-pose rotation when
 * no clip is animating it — otherwise we'd fight the mixer.
 */
function someAnimationActive(
  actions: Record<string, THREE.AnimationAction>
): boolean {
  for (const id of Object.keys(actions)) {
    if (actions[id].getEffectiveWeight() > 0.01) return true;
  }
  return false;
}

interface LoadedClip {
  id: string;
  clip: THREE.AnimationClip;
}

/**
 * Raw output from probing a pose's GLB/FBX file. The MannequinModel reads
 * `sourceScene` to extract the SOURCE skeleton (Mixamo Y-Bot bind pose) and
 * the `clip` to feed `SkeletonUtils.retargetClip`, which rewrites every
 * track to match OUR sb_mannequin's SMPL-X bind pose. That fixes the
 * crouched / arms-up artifact you get when Mixamo rotations are applied
 * directly to a different-bind-pose skeleton.
 */
interface ProbedClip {
  id: string;
  sourceScene: THREE.Object3D;
  sourceClip: THREE.AnimationClip;
  format: "glb" | "fbx" | "gltf";
}

/**
 * Probe a single pose by trying multiple filename casings + extensions
 * (.glb / .fbx / .gltf). Returns the loaded scene + first animation clip,
 * or null when no candidate loaded successfully. Retargeting happens
 * downstream in MannequinModel where we have the target skeleton.
 */
function useProbedClip(id: string): ProbedClip | null {
  const candidates = React.useMemo(() => buildCandidates(id), [id]);
  const result = useOptionalGLTF(candidates);
  if (!result || result.animations.length === 0) return null;
  return {
    id,
    sourceScene: result.scene,
    sourceClip: result.animations[0],
    format: result.format,
  };
}

/**
 * Find the first SkinnedMesh in a subtree. Both the cloned sb_mannequin
 * and the FBX-loaded source scenes have a single SkinnedMesh hanging off
 * a Group root, so a depth-first walk to the first match is sufficient.
 */
function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((obj) => {
    if (!found && (obj as THREE.SkinnedMesh).isSkinnedMesh) {
      found = obj as THREE.SkinnedMesh;
    }
  });
  return found;
}

function MannequinModel() {
  const { scene } = useGLTF(MANNEQUIN_URL);

  // Clone using SkeletonUtils so the SkinnedMesh's bone references point at
  // the CLONED bones in this subtree, not the original cached scene's bones.
  // Plain Object3D.clone() leaves the SkinnedMesh referencing the original
  // skeleton — any animation applied to the cloned bones would be ignored.
  // Also locate the head bone for look-at targeting and attach an outline
  // helper for the selection visual.
  const { cloned, headBone } = React.useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    let head: THREE.Bone | null = null;
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
      if (obj.name === "mixamorigHead" && (obj as THREE.Bone).isBone) {
        head = obj as THREE.Bone;
      }
    });
    return { cloned: c, headBone: head };
  }, [scene]);

  // Probe every potential clip file. Hooks-rules require fixed call order,
  // so we map over the static ALL_POSE_IDS list. Missing files return null
  // gracefully.
  const probedClips: (ProbedClip | null)[] = ALL_POSE_IDS.map((id) =>
    useProbedClip(id)
  );

  // Retarget each probed clip from its source skeleton (the Mixamo Y-Bot
  // bind pose embedded in the FBX/GLB) onto OUR sb_mannequin's SMPL-X bind
  // pose. SkeletonUtils.retargetClip walks the clip frame-by-frame, plays
  // it on the source skeleton, then samples each target bone's resulting
  // local quaternion — so the output clip is authored in our bind frame.
  // After retargeting we strip the hips position track (Mixamo's "In
  // Place" workflow assumes the consumer ignores hip translation).
  const availableKey = probedClips
    .map((c, i) => (c ? ALL_POSE_IDS[i] : ""))
    .join(",");
  const loadedClips: (LoadedClip | null)[] = React.useMemo(() => {
    const targetMesh = findSkinnedMesh(cloned);
    if (!targetMesh) return probedClips.map(() => null);
    return probedClips.map((p) => {
      if (!p) return null;
      const sourceMesh = findSkinnedMesh(p.sourceScene);
      if (!sourceMesh) return null;
      try {
        const retargeted = SkeletonUtils.retargetClip(
          targetMesh,
          sourceMesh,
          p.sourceClip,
          {
            // Hip bone identifier — retargetClip needs this hint to
            // special-case the root joint's position tracks.
            hip: "mixamorigHips",
            // Hip position is relative to its first-frame value (so the
            // mannequin doesn't teleport when a clip starts).
            useFirstFramePosition: true,
            // Sample at cinema rate to match the rest of the rig.
            fps: 24,
          } as Record<string, unknown>
        );
        retargeted.name = p.id;
        // Drop hips position entirely so In-Place clips stay grounded on
        // our skeleton regardless of the source's hip height.
        retargeted.tracks = retargeted.tracks.filter(
          (t) => t.name !== "mixamorigHips.position"
        );
        return { id: p.id, clip: retargeted };
      } catch (err) {
        console.warn(`[Mannequin] retarget failed for ${p.id}:`, err);
        return null;
      }
    });
  }, [cloned, availableKey]);

  // Push the available pose-ids to the store so the PosePicker UI can show
  // only what actually loaded + successfully retargeted.
  const setAvailableIds = usePoseStore((s) => s.setAvailableIds);
  React.useEffect(() => {
    const ids = loadedClips
      .filter((c): c is LoadedClip => c != null)
      .map((c) => c.id);
    setAvailableIds(ids);
  }, [availableKey, setAvailableIds, loadedClips]);

  // Build a single AnimationMixer for the cloned root + attach each loaded
  // clip as an AnimationAction we can fade in/out.
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  // Cache the head bone's bind-pose local rotation so we can restore it
  // after the user clears their look-at target.
  const headBindQuatRef = useRef<THREE.Quaternion | null>(null);
  React.useEffect(() => {
    if (headBone && !headBindQuatRef.current) {
      headBindQuatRef.current = headBone.quaternion.clone();
    }
  }, [headBone]);

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
  const lookAtTarget = usePoseStore((s) => s.lookAtTarget);

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

    // Head look-at: override the head bone's rotation AFTER mixer.update
    // so the user's chosen gaze target wins over the animation's head
    // channel. Three's Bone.lookAt() uses world matrices, so we need an
    // up-to-date world transform first.
    if (headBone) {
      if (lookAtTarget) {
        headBone.updateMatrixWorld(true);
        headBone.lookAt(lookAtTarget[0], lookAtTarget[1], lookAtTarget[2]);
        // Bone.lookAt() points the LOCAL -Z axis at the target, but the
        // Mixamo head bone's intrinsic "face forward" is along local +Z
        // (the +Z axis pokes out through the forehead). A 180° rotation
        // around the bone's local Y axis swaps -Z and +Z, putting the
        // face direction on the target.
        headBone.rotateY(Math.PI);
      } else if (
        headBindQuatRef.current &&
        // Restore the bind-pose head rotation when NO animation channel
        // is driving the head — otherwise the mixer already overwrote
        // headBone.quaternion this frame and our restore would fight it.
        !someAnimationActive(actionsRef.current)
      ) {
        headBone.quaternion.copy(headBindQuatRef.current);
      }
    }
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
  const selected = usePoseStore((s) => s.selected);
  const setSelected = usePoseStore((s) => s.setSelected);

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
    // Click toggles the selection state, which mounts <MannequinPopup />
    // anchored near the head. Drive mode disables selection (the click
    // would compete with mouselook).
    <group
      ref={carRef}
      position={[0, GROUND_Y, 0]}
      onClick={(e) => {
        if (thirdMode) return;
        e.stopPropagation();
        setSelected(!selected);
      }}
    >
      <Suspense fallback={null}>
        <MannequinModel />
      </Suspense>
      {selected && <MannequinPopup />}
    </group>
  );
};

export default Car;
