// Moon position + phase via astronomy-engine.
//
// `astronomy-engine` is a high-accuracy ephemeris library (already a
// transitive dependency through @takram/three-atmosphere). We use it for the
// moon because phase calculations are non-trivial and the sun helper in
// solarPosition.ts uses its own NOAA implementation — different priorities:
//   - Sun: simple deterministic NOAA algorithm, already accurate to 0.01°
//   - Moon: phase + libration + geocentric position needs real ephemeris

import {
  Body,
  Equator,
  Horizon,
  Illumination,
  Observer,
} from "astronomy-engine";

export interface MoonPosition {
  /** Altitude in radians above horizon. Negative = below horizon. */
  altitudeRad: number;
  /** Azimuth in radians, measured clockwise from north. */
  azimuthRad: number;
  /** Fraction of disk illuminated by the sun (0=new, 1=full). */
  illuminationFrac: number;
  /**
   * Phase angle in degrees. 0=full, 180=new. Useful for color biasing
   * (waxing/waning are slightly cooler than perfectly full).
   */
  phaseAngleDeg: number;
}

const DEG_TO_RAD = Math.PI / 180;

export function getMoonPosition(
  date: Date,
  lat: number,
  lng: number
): MoonPosition {
  // height=0 is a fine approximation for any city we'd be scouting; the
  // observer's altitude above ellipsoid affects horizon by <0.1° at street
  // level, which is irrelevant for lighting direction.
  const observer = new Observer(lat, lng, 0);

  // Apparent equatorial coords corrected for aberration + of-date.
  const eq = Equator(Body.Moon, date, observer, true, true);

  // Horizontal coordinates with normal atmospheric refraction.
  const hor = Horizon(date, observer, eq.ra, eq.dec, "normal");

  const illum = Illumination(Body.Moon, date);

  return {
    altitudeRad: hor.altitude * DEG_TO_RAD,
    azimuthRad: hor.azimuth * DEG_TO_RAD,
    illuminationFrac: illum.phase_fraction,
    phaseAngleDeg: illum.phase_angle,
  };
}

/**
 * Convert moon altitude/azimuth to scout3d's local east-up-south frame.
 * Same convention as `solarDirectionVector` in solarPosition.ts so swapping
 * sun/moon vectors in a DirectionalLight produces consistent lighting math.
 */
export function moonDirectionVector(
  pos: MoonPosition
): [number, number, number] {
  const a = pos.altitudeRad;
  const z = pos.azimuthRad;
  const east = Math.sin(z) * Math.cos(a);
  const up = Math.sin(a);
  const south = -Math.cos(z) * Math.cos(a);
  return [east, up, south];
}

/**
 * Phase-tinted moonlight color. Real moonlight is a cool desaturated white;
 * sliver moons reflect slightly more red-orange because we see more of the
 * scattered light. Returns a CSS hex string suitable for `THREE.Color`.
 */
export function moonColorForPhase(pos: MoonPosition): string {
  // Map illumination 0..1 → palette from dim warm (#3a2a25) to bright cool
  // (#cfd8e8). Linear interp on R/G/B channels.
  const t = Math.max(0, Math.min(1, pos.illuminationFrac));
  const r = Math.round(58 + (207 - 58) * t);
  const g = Math.round(42 + (216 - 42) * t);
  const b = Math.round(37 + (232 - 37) * t);
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Effective moonlight intensity factor based on altitude and phase.
 * Full moon at zenith ≈ 1. New moon ≈ 0. Multiply by a small absolute
 * intensity in the renderer (moonlight is roughly 1/400,000 of sunlight).
 */
export function moonIntensityFactor(pos: MoonPosition): number {
  if (pos.altitudeRad <= 0) return 0;
  // Smooth altitude falloff that matches sin(altitude) at the horizon.
  const altFactor = Math.sin(pos.altitudeRad);
  return altFactor * pos.illuminationFrac;
}
