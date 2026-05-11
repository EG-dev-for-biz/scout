// GeneratedObjects.tsx
//
// Renders every entry in generatedObjectStore into the R3F scene.
//
// Loading: each GLB is fetched through the scout3d-asset:// custom
// protocol registered in main/index.ts. We reuse useOptionalGLTF to
// stay consistent with how the mannequin loads its FBX/GLB clips.
//
// On first load each mesh is centred + ground-snapped so it sits
// _on_ the world ground plane regardless of how the AI exporter
// chose its origin. Normals are recomputed (SF3D output occasionally
// ships without vertex normals) and materials forced to DoubleSide
// because dual-grid decoders sometimes emit inverted winding.
//
// Selection: clicking the prop highlights it (light cyan rim via a
// thin outline mesh) and hands off to the App-level toolbar that
// flips between translate / rotate / scale gizmos.

import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TransformControls } from "@react-three/drei";
import { useOptionalGLTF } from "./useOptionalGLTF";
import {
  useGeneratedObjectStore,
  type GeneratedObject as GeneratedObjectData,
} from "@/state/generatedObjectStore";
import { useProjectStore } from "@/state/projectStore";

// ─── Single-object renderer ───────────────────────────────────────────────

function GeneratedObject({ obj }: { obj: GeneratedObjectData }) {
  const result = useOptionalGLTF(obj.glbUrl);
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);

  const selectedId = useGeneratedObjectStore((s) => s.selectedId);
  const transformMode = useGeneratedObjectStore((s) => s.transformMode);
  const selectObject = useGeneratedObjectStore((s) => s.selectObject);
  const updateObject = useGeneratedObjectStore((s) => s.updateObject);
  const markDirty = useProjectStore((s) => s.markDirty);

  const isSelected = selectedId === obj.id;

  // Per-instance clone so the same GLB URL can be placed multiple times
  // without their transforms colliding. useGLTF/useOptionalGLTF share a
  // cached scene by URL, so we mount a clone instead of the original.
  const sceneClone = useMemo(() => {
    if (!result?.scene) return null;
    const cloned = result.scene.clone(true);

    // Centre on XZ; sit on Y=0 so the user's click-point is the prop's
    // base, not its midpoint or arbitrary export origin.
    const box = new THREE.Box3().setFromObject(cloned);
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    cloned.position.set(-centre.x, -box.min.y, -centre.z);

    // Normalise extents to a ~1m bounding box BEFORE the user's scale
    // is applied at the group level, so different AI outputs all read
    // at comparable sizes in the world.
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxEdge = Math.max(size.x, size.y, size.z);
    if (maxEdge > 0 && Number.isFinite(maxEdge)) {
      const k = 1 / maxEdge;
      cloned.scale.setScalar(k);
      cloned.position.multiplyScalar(k);
    }

    // Fix AI-mesh quirks: ensure normals + double-sided materials.
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals();
        }
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const mat of mats) {
          if (mat) (mat as THREE.Material).side = THREE.DoubleSide;
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return cloned;
  }, [result?.scene]);

  // Commit transform changes back to the store on drag end so they
  // survive a project save / reload.
  const commitTransform = () => {
    const grp = groupRef.current;
    if (!grp) return;
    updateObject(obj.id, {
      position: {
        x: grp.position.x,
        y: grp.position.y,
        z: grp.position.z,
      },
      rotation: {
        x: grp.rotation.x,
        y: grp.rotation.y,
        z: grp.rotation.z,
      },
      scale: grp.scale.x,
    });
    markDirty();
  };

  if (!result) {
    // Still loading — render nothing rather than a placeholder; the
    // first GLB load is fast over a local custom protocol.
    return null;
  }

  return (
    <>
      <group
        ref={groupRef}
        position={[obj.position.x, obj.position.y, obj.position.z]}
        rotation={[obj.rotation.x, obj.rotation.y, obj.rotation.z]}
        scale={obj.scale}
        onClick={(e) => {
          e.stopPropagation();
          selectObject(obj.id);
        }}
      >
        <group ref={innerRef}>
          {sceneClone && <primitive object={sceneClone} />}
        </group>
      </group>

      {isSelected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode={transformMode}
          size={0.75}
          onMouseUp={commitTransform}
        />
      )}
    </>
  );
}

// ─── Collection wrapper ───────────────────────────────────────────────────

export function GeneratedObjects() {
  const objects = useGeneratedObjectStore((s) => s.objects);
  const selectedId = useGeneratedObjectStore((s) => s.selectedId);

  // Backspace / Delete removes the currently-selected generated object.
  // Lives here (not inside per-object components) so we only register
  // one listener regardless of object count.
  useEffect(() => {
    if (!selectedId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      useGeneratedObjectStore.getState().removeObject(selectedId);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  return (
    <>
      {objects.map((obj) => (
        <GeneratedObject key={obj.id} obj={obj} />
      ))}
    </>
  );
}
