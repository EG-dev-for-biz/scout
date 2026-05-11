import { useFrame } from "@react-three/fiber";
import { forwardRef } from "react";
import { Mesh, Vector3 } from "three";
import { useTimeStore } from "@/state/timeStore";
import { useAreaStore } from "@/state/areaStore";
import {
  getSolarPosition,
  solarDirectionVector,
} from "@/utils/solarPosition";

// ---------------------------------------------------------------------------
// <SunMarker />
// ---------------------------------------------------------------------------
//
// A tiny white sphere parked along the sun's altitude/azimuth vector at a
// large but finite distance. The `<GodRays>` postprocessing pass needs a
// real scene Mesh as its `sun` prop — it reads the silhouette via depth
// to seed radial blur.
//
// The marker is INTENTIONALLY:
//   - Tiny (radius ~12 m, well below resolvable size at 4000 m).
//   - Drawn with MeshBasicMaterial(white) so it doesn't depend on lighting.
//   - Frustum-cull DISABLED so it always lives in the GodRays buffer.
//   - Tagged `userData-skipExport` so GLB export drops it.
//
// Direction: when an explicit `direction` prop is provided we follow it
// (used by the legacy <PostFX> path so the marker tracks the drei <Sky>
// disc, which uses the style preset's authored sun position). Otherwise
// we fall back to the real astronomical solar position for the scene's
// date and lat/lng — which is what the atmospheric path's takram <Sky>
// uses.

// SUN_DISTANCE places the marker safely in front of the far plane but
// outside the building cluster so it occludes correctly.
//
// SUN_RADIUS must be LARGE ENOUGH that the marker reads as more than a
// pixel or two in the GodRays half-resolution buffer. The effect uses
// the mesh's depth-buffer silhouette to seed its radial blur; a marker
// that's sub-pixel at the effect's working resolution produces no rays
// at all even when the toggle is on.
//
// Angular size = 2 * atan(r / d). With r=150, d=4000 the marker spans
// ~4.3° (≈80 pixels at 1080p vertical FOV 60°, ~40 pixels at the
// half-res GodRays buffer) — plenty for a stable ray cone.
const SUN_DISTANCE = 4000;
const SUN_RADIUS = 150;
const tmpDir = new Vector3();

interface SunMarkerProps {
  /**
   * Optional unit-ish vector pointing FROM origin TO the sun. Doesn't
   * need to be normalized — we normalize internally before scaling by
   * SUN_DISTANCE. When omitted, the marker uses the astronomical solar
   * position for the scene's current date and lat/lng.
   */
  direction?: [number, number, number] | null;
}

export const SunMarker = forwardRef<Mesh, SunMarkerProps>(function SunMarker(
  { direction },
  ref
) {
  const date = useTimeStore((s) => s.date);
  const center = useAreaStore((s) => s.center);
  const refLat = (center[0].lat + center[1].lat) / 2;
  const refLng = (center[0].lng + center[1].lng) / 2;

  useFrame(() => {
    const mesh = (ref as React.MutableRefObject<Mesh | null>).current;
    if (!mesh) return;

    if (direction) {
      tmpDir.set(direction[0], direction[1], direction[2]).normalize();
    } else {
      const sun = getSolarPosition(date, refLat, refLng);
      const [x, y, z] = solarDirectionVector(sun);
      tmpDir.set(x, y, z);
    }

    mesh.position.set(
      tmpDir.x * SUN_DISTANCE,
      tmpDir.y * SUN_DISTANCE,
      tmpDir.z * SUN_DISTANCE
    );
    // Hide when below horizon — the GodRays effect would otherwise smear
    // an upside-down ray bar through the scene at night.
    mesh.visible = tmpDir.y > 0;
  });

  return (
    <mesh
      ref={ref}
      frustumCulled={false}
      userData-skipExport={true}
      renderOrder={999}
    >
      <sphereGeometry args={[SUN_RADIUS, 16, 8]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} />
    </mesh>
  );
});
