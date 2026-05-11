import React, { useRef, useEffect, useCallback, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useFBX } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { useCarStore } from "@/state/carStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useProjectStore } from "@/state/projectStore";
import { useCameraStore } from "@/state/cameraStore";
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
// mannequin.fbx is the masculine art-mannequin (rigged SkinnedMesh with
// an embedded 1024px white texture). The clip library in /anim/ was
// originally authored on Lily's skeleton; the bone-name normalization
// inside MannequinModel handles any mixamorig: / mixamorig_ variants,
// and the bounding-box scale normalization handles cm-vs-m exports.
const MANNEQUIN_URL = "/models/mannequin.fbx";
useFBX.preload(MANNEQUIN_URL);

// Buffer between the mannequin's feet and the local ground origin so the
// soles don't z-fight with the satellite/road plane. The feet position
// itself is measured from the loaded model's bounding box at runtime
// (see MannequinModel) so swapping in a different Mixamo character later
// doesn't require updating a magic-number constant.
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
 * order with both `.glb` and `.fbx` extensions so users can drop matched
 * clip exports without renaming. First file that loads wins.
 *
 * Primary names match Lily's bundled animation library (now in /anim/).
 * Secondary names are kept as fallbacks in case a future character pack
 * uses Mixamo-style filenames (Running, Sitting, etc.).
 */
const POSE_FILENAME_BASES: Record<string, string[]> = {
  idle: ["idle", "Idle"],
  walk: ["walk", "Walk", "Walking"],
  run: ["run", "Run", "FastRun", "Fast_Run", "Running"],
  jump: ["jump", "Jump"],
  sit: ["sit", "Sit", "SittingIdle", "Sitting_Idle", "Sitting"],
  layingPose: [
    "layingPose",
    "LayingPose",
    "FemaleLayingPose",
    "Female_Laying_Pose",
    "Laying",
  ],
  layingPose2: [
    "layingPose2",
    "LayingPose2",
    "FemaleLayingPose2",
    "Female_Laying_Pose_2",
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
// Lily's library has no separate jog clip — FastRun covers everything
// above walking pace, so the band is collapsed to a single threshold.
// Anything below 0.1 → idle; below 3.5 → walk; else run.
function locomotionForSpeed(speed: number): string {
  const s = Math.abs(speed);
  if (s < 0.1) return "idle";
  if (s < 3.5) return "walk";
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
 * Probe a single pose by trying multiple filename casings + extensions
 * (.glb / .fbx / .gltf). Returns the first matching animation clip, or
 * null when no candidate file resolves.
 *
 * Because the character mannequin and the clip files share the canonical
 * Mixamo skeleton (same bone names, same Y-bind), the clip plays directly
 * — no SkeletonUtils.retargetClip step is needed. The only massage is
 * stripping any residual `mixamorigHips.position` track so In-Place
 * exports stay glued to the ground regardless of authoring quirks.
 */
function useProbedClip(id: string): LoadedClip | null {
  const candidates = React.useMemo(() => buildCandidates(id), [id]);
  const result = useOptionalGLTF(candidates);
  React.useEffect(() => {
    if (result == null) {
      console.log(`[Mannequin] probe "${id}": no candidate loaded`);
    } else {
      console.log(
        `[Mannequin] probe "${id}": loaded (${result.format}), ` +
          `${result.animations.length} clip(s)`
      );
    }
  }, [id, result]);
  return React.useMemo(() => {
    if (!result || result.animations.length === 0) return null;
    // Clone before mutating tracks — useOptionalGLTF caches the source
    // clip object and re-probes shouldn't see a stripped track list.
    const clip = result.animations[0].clone();
    clip.name = id;
    clip.tracks = clip.tracks.filter(
      (t) => t.name !== "mixamorigHips.position"
    );
    return { id, clip };
  }, [id, result]);
}

function MannequinModel() {
  const fbx = useFBX(MANNEQUIN_URL);

  // Clone using SkeletonUtils so the SkinnedMesh's bone references point
  // at the CLONED bones in this subtree, not the original cached scene's
  // bones. Plain Object3D.clone() leaves the SkinnedMesh referencing the
  // original skeleton — animations on the cloned bones would be ignored.
  //
  // While we're walking the tree, also locate the head bone for look-at
  // targeting, enable shadows, normalize scale if the FBX arrived in
  // centimeters, and measure the feet position so the outer group can
  // park on GROUND_Y regardless of the source character's origin.
  const { cloned, headBone, footLift } = React.useMemo(() => {
    const c = SkeletonUtils.clone(fbx) as THREE.Object3D;
    let head: THREE.Bone | null = null;
    c.traverse((obj) => {
      // Normalize Mixamo-style bone name variants so AnimationMixer can
      // resolve clip tracks regardless of which export convention the
      // source FBX used. "mixamorig:Hips" / "mixamorig_Hips" both
      // collapse to the canonical "mixamorigHips" used by clip tracks.
      if ((obj as THREE.Bone).isBone) {
        obj.name = obj.name
          .replace(/^mixamorig:/, "mixamorig")
          .replace(/^mixamorig_/, "mixamorig");
      }
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        // SkinnedMesh frustum culling uses bind-pose bounds, which can
        // be tight enough that a moving animation pushes vertices off
        // screen logically. One mesh — skipping culling is cheap.
        m.frustumCulled = false;
      }
      if (obj.name === "mixamorigHead" && (obj as THREE.Bone).isBone) {
        head = obj as THREE.Bone;
      }
    });

    // Mixamo FBX exports frequently arrive at 100x (cm-authored, with a
    // UnitScaleFactor the loader didn't normalize). If the model looks
    // like a skyscraper, scale the cloned root to meters before measuring.
    c.updateMatrixWorld(true);
    const probeBox = new THREE.Box3().setFromObject(c);
    const probeHeight = probeBox.max.y - probeBox.min.y;
    if (probeHeight > 10) {
      c.scale.setScalar(0.01);
      c.updateMatrixWorld(true);
    }

    // Derive foot-lift from the (post-rescale) bounds so the outer
    // group can sit on GROUND_Y and the soles land MANNEQUIN_GROUND_BUFFER
    // above it. Robust to characters with origin-at-feet, origin-at-hips,
    // or origin-at-head conventions.
    const box = new THREE.Box3().setFromObject(c);
    const lift = -box.min.y + MANNEQUIN_GROUND_BUFFER;

    return { cloned: c, headBone: head, footLift: lift };
  }, [fbx]);

  // Probe every potential clip file. Hooks-rules require fixed call
  // order, so we map over the static ALL_POSE_IDS list. Missing files
  // return null gracefully. Each successful probe is already a clip
  // ready to attach to the mixer — useProbedClip handles the hip-track
  // strip inline.
  const probedClips: (LoadedClip | null)[] = ALL_POSE_IDS.map((id) =>
    useProbedClip(id)
  );

  // Stable key over the set of available pose ids — downstream memos /
  // effects only re-fire when a file actually resolves or disappears.
  const availableKey = probedClips
    .map((c, i) => (c ? ALL_POSE_IDS[i] : ""))
    .join(",");

  // Push the available pose-ids to the store so the PosePicker UI can
  // show only what actually loaded.
  const setAvailableIds = usePoseStore((s) => s.setAvailableIds);
  React.useEffect(() => {
    const ids = probedClips
      .filter((c): c is LoadedClip => c != null)
      .map((c) => c.id);
    setAvailableIds(ids);
    // probedClips is read inside the effect; availableKey + the setter
    // are the actual change drivers, so it's safe to omit probedClips
    // from the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableKey, setAvailableIds]);

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
    for (const c of probedClips) {
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
    // probedClips is read here; availableKey captures the set of non-null
    // entries, which is the only signal that should rebuild the mixer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Mannequin is authored facing +Z (Mixamo convention); rotate 180° so
  // forward = -Z to match scout3d's drive-mode camera. footLift is
  // measured per-character in the useMemo above so the feet sit on
  // GROUND_Y regardless of the source FBX's origin convention.
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
    //
    // PICK MODE HANDOFF: when the user is in the middle of picking a
    // focus point or look-at target, clicking the mannequin should SET
    // focus/gaze ON the mannequin's body — not toggle the popup. We do
    // the store mutation directly here (with stopPropagation) instead
    // of letting the click bubble, because the scene's onSceneClick
    // path is only wired into Buildings and the GroundPlane — the
    // mannequin lives in its own scene-graph branch and bubbling would
    // just drop the click on the floor. Mannequin = best focus subject
    // in a scout scene, so making it pickable matters.
    <group
      ref={carRef}
      position={[0, GROUND_Y, 0]}
      onClick={(e) => {
        if (thirdMode) return;
        const cam = useCameraStore.getState();
        const pose = usePoseStore.getState();
        const hit: [number, number, number] = [e.point.x, e.point.y, e.point.z];

        if (cam.focusPickMode) {
          cam.setFocusTarget(hit);
          cam.setFocusPickMode(false);
          e.stopPropagation();
          return;
        }
        if (pose.lookAtPickMode) {
          pose.setLookAtTarget(hit);
          pose.setLookAtPickMode(false);
          e.stopPropagation();
          return;
        }
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
