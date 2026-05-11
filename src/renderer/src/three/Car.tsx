import React, { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useCarStore } from "@/state/carStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useProjectStore } from "@/state/projectStore";

const Car = () => {
  const carRef = useRef<THREE.Mesh>(null);
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

    // Movement
    const accelerationRate = 0.2;
    const maxSpeed = 3.0;
    const decelerationRate = 1.0;

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
      // Eye-level camera locked to car's heading
      const eyeOffset = new THREE.Vector3(0, 0.25, 0.05);
      eyeOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), carRef.current.rotation.y);
      camera.position.lerp(carPos.clone().add(eyeOffset), 0.2);
      const lookTarget = carPos.clone().add(
        new THREE.Vector3(0, 0.25, -2).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          carRef.current.rotation.y
        )
      );
      camera.lookAt(lookTarget);
    } else {
      // Third-person: behind and above
      const offset = new THREE.Vector3(0, 1, 2);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), carRef.current.rotation.y);
      camera.position.lerp(carPos.clone().add(offset), 0.1);
      camera.lookAt(carPos);
    }
  });

  return (
    <mesh ref={carRef} position={[0, 0.1, 0]}>
      <boxGeometry args={[0.3, 0.15, 0.5]} />
      <meshStandardMaterial color="#f97316" />
    </mesh>
  );
};

export default Car;
