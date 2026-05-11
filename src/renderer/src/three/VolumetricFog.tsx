import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, Vector3 } from "three";
import { VolumetricFogEffect } from "./VolumetricFogEffect";
import { useWeatherStore, windVelocityEastNorth } from "@/state/weatherStore";
import { useTimeStore } from "@/state/timeStore";
import { useAreaStore } from "@/state/areaStore";
import {
  getSolarPosition,
  solarDirectionVector,
} from "@/utils/solarPosition";
import { GROUND_Y } from "./Space";

// ---------------------------------------------------------------------------
// <VolumetricFog kind="ground" | "haze" />
// ---------------------------------------------------------------------------
//
// R3F wrapper that constructs a single VolumetricFogEffect and routes the
// live weather/sun/wind state into its uniforms each frame. Mounted as a
// `<primitive>` child of `<EffectComposer>`.
//
// Two presets share one shader:
//   - "ground": low (~heightTop=fog.heightTop), neutral color, no sun
//     coupling. Bound to the weatherStore's `fog` block.
//   - "haze":   tall (~8000m), sun-coupled, color = haze.tint. Bound to
//     the weatherStore's `haze` block.
//
// Each instance is gated by its own enable flag in the store, so the R3F
// wrapper *always* renders an effect instance but neuters its density to
// zero when disabled. (Mounting/unmounting the effect tears down the
// EffectComposer's internal material recompile chain, which is expensive
// during slider drags.)

interface VolumetricFogProps {
  kind: "ground" | "haze";
}

export function VolumetricFog({ kind }: VolumetricFogProps) {
  const fog = useWeatherStore((s) => s.fog);
  const haze = useWeatherStore((s) => s.haze);
  const wind = useWeatherStore((s) => s.wind);

  const date = useTimeStore((s) => s.date);
  const center = useAreaStore((s) => s.center);
  const refLat = (center[0].lat + center[1].lat) / 2;
  const refLng = (center[0].lng + center[1].lng) / 2;

  const camera = useThree((s) => s.camera);

  const effect = useMemo(() => {
    return new VolumetricFogEffect({
      kind,
      // Initial values are immediately overwritten by the useEffect below
      // — but they make the first frame look right if state hasn't propagated.
      color: kind === "ground" ? fog.color : haze.tint,
      density: kind === "ground" ? fog.density : haze.amount * 0.06,
      heightTop: kind === "ground" ? fog.heightTop : 8000,
      heightFalloff: kind === "ground" ? fog.heightFalloff : 2500,
      groundY: GROUND_Y,
      // Sun tint = haze tint for ground (subtle warming at dawn/dusk); haze
      // gets aggressive sun coupling so silhouettes pick up the warm rim.
      sunTint: haze.tint,
      sunCoupling: kind === "ground" ? 0.15 : 0.9,
      maxFog: kind === "ground" ? 0.92 : 0.6,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // Dispose the effect's resources when the component unmounts.
  useEffect(() => {
    return () => effect.dispose();
  }, [effect]);

  // Live update of static-ish uniforms. These don't need to be in useFrame
  // because they change on user input, not per-frame.
  useEffect(() => {
    if (kind === "ground") {
      effect.setColor(fog.color);
      effect.setHeightTop(fog.heightTop);
      effect.setHeightFalloff(fog.heightFalloff);
      // Density gates the enabled flag: 0 = invisible, save the fragment
      // shader from doing real work via early-out on inputColor.
      effect.setDensity(fog.enabled ? fog.density : 0);
      effect.setSunTint(haze.tint);
    } else {
      effect.setColor(haze.tint);
      effect.setSunTint(haze.tint);
      // Haze "amount" is a 0..2 dial; the shader works best with density
      // in roughly the 0..0.15 range, so scale conservatively.
      effect.setDensity(haze.enabled ? haze.amount * 0.06 : 0);
      effect.setHeightTop(8000);
      effect.setHeightFalloff(2500);
    }
  }, [effect, kind, fog, haze]);

  // Sun direction is a per-frame value because the scene date may be
  // animated (live mode) and we want fog tint to follow.
  const sunDirRef = useRef(new Vector3());

  useFrame(() => {
    // Camera matrices → effect uniforms.
    effect.syncCamera(camera);

    // Sun direction in scene-local frame.
    const sun = getSolarPosition(date, refLat, refLng);
    const [sx, sy, sz] = solarDirectionVector(sun);
    sunDirRef.current.set(sx, sy, sz);
    effect.setSunDirection(sx, sy, sz);

    // Wind drift in east/north m/s.
    const [east, north] = windVelocityEastNorth(wind);
    effect.setWind(east, north);
  });

  return <primitive object={effect} />;
}

// Helper kept for tests / external uses — converts a hex string to a THREE
// Color without surfacing Color in callers. Currently unused; kept because
// the effect's R3F integration may grow callers that want to set color
// without going through the store.
export function hexToColor(hex: string): Color {
  return new Color(hex);
}
