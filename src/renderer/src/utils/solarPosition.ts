// Solar position calculator.
//
// Computes the sun's altitude (above horizon, radians) and azimuth (compass
// direction from north, radians) for a given lat/lng + UTC date.
//
// Implementation: NOAA Solar Position Algorithm — accurate to ~0.01° for any
// year between 1950 and 2050, which is far better than we need for lighting.
// Reference: https://gml.noaa.gov/grad/solcalc/calcdetails.html

export interface SolarPosition {
  /** Altitude in radians above horizon. Negative = below horizon (night). */
  altitude: number;
  /** Azimuth in radians, measured clockwise from north. */
  azimuth: number;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function getSolarPosition(date: Date, lat: number, lng: number): SolarPosition {
  // Days since J2000 epoch (12:00 UT on 1 Jan 2000)
  const jd = date.getTime() / 86400000 + 2440587.5; // Julian Date
  const n = jd - 2451545.0;

  // Mean longitude of the Sun
  const L = (280.46 + 0.9856474 * n) % 360;
  // Mean anomaly
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  // Ecliptic longitude
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  // Obliquity of ecliptic
  const epsilon = (23.439 - 0.0000004 * n) * RAD;

  // Right ascension and declination
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda));

  // Greenwich mean sidereal time
  const utHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const gmstHours = (gmst + 24) % 24;
  // Local sidereal time → hour angle
  const lst = ((gmstHours * 15 + lng) % 360) * RAD;
  let H = lst - ra;
  if (H > Math.PI) H -= 2 * Math.PI;
  if (H < -Math.PI) H += 2 * Math.PI;

  const phi = lat * RAD;

  // Altitude
  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)
  );
  // Azimuth (clockwise from north)
  const azimuth = Math.atan2(
    -Math.sin(H),
    Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H)
  );

  return {
    altitude,
    azimuth: (azimuth + 2 * Math.PI) % (2 * Math.PI),
  };
}

/**
 * Convert a SolarPosition into a Three.js-friendly direction vector.
 * Uses our scene convention: +Y is up, -Z is north, +X is east.
 *
 * Returns a unit vector pointing FROM the sun TO the scene origin (so a
 * directional light at this position * distance casts light correctly).
 */
export function solarDirectionVector(
  pos: SolarPosition
): [number, number, number] {
  const r = Math.cos(pos.altitude);
  const x = r * Math.sin(pos.azimuth); // east component
  const y = Math.sin(pos.altitude); // up component
  const z = -r * Math.cos(pos.azimuth); // -z = north
  return [x, y, z];
}

/**
 * Convenience: format a small human-readable label for the current sun.
 * E.g. "Sun: 32° above, SW" or "Below horizon (night)".
 */
export function formatSolarPosition(pos: SolarPosition): string {
  if (pos.altitude < 0) {
    const deg = Math.round(pos.altitude * DEG);
    return `Below horizon (${deg}°)`;
  }
  const altDeg = Math.round(pos.altitude * DEG);
  const azDeg = pos.azimuth * DEG;
  const compass = compassFromAzimuth(azDeg);
  return `${altDeg}° altitude, ${compass}`;
}

function compassFromAzimuth(azDeg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((azDeg % 360) + 360) / 45) % 8;
  return dirs[idx];
}

/**
 * Returns true if the sun is up at the given moment.
 */
export function isDaytime(date: Date, lat: number, lng: number): boolean {
  return getSolarPosition(date, lat, lng).altitude > 0;
}

// ---------------------------------------------------------------------------
// Solar event solver
// ---------------------------------------------------------------------------

/**
 * Find the moment ON THE SAME CALENDAR DAY when the sun's altitude equals
 * `targetAltitudeDeg`. `direction` picks which branch of the daily arc:
 *   - "rising"  → the morning crossing (sun gaining altitude)
 *   - "setting" → the evening crossing (sun losing altitude)
 *
 * Returns null when the target altitude is never reached that day at the
 * given latitude — e.g. polar day/night, or a latitude where the sun never
 * reaches +6° in winter. Callers should disable their UI accordingly.
 *
 * Implementation: walk minutes-of-day at 5-minute steps to find the bracket
 * where altitude crosses the target, then binary-search to second-level
 * precision. ~150 sun-position evaluations per call; well under 1ms.
 */
export function findSolarEvent(
  date: Date,
  lat: number,
  lng: number,
  targetAltitudeDeg: number,
  direction: "rising" | "setting"
): Date | null {
  const target = targetAltitudeDeg * RAD;

  // Build the start of the local day. We use the input date's local
  // calendar day; the search walks LOCAL hours so "sunrise" lands on the
  // same calendar day the user picked.
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const STEP_MIN = 5;
  const altAt = (minutes: number): number => {
    const d = new Date(dayStart);
    d.setMinutes(minutes);
    return getSolarPosition(d, lat, lng).altitude - target;
  };

  // Coarse scan for sign changes. Collect every bracket so we can pick
  // rising vs setting deterministically. At polar latitudes there may be
  // zero or two brackets in a 24-hour window.
  const brackets: { lo: number; hi: number }[] = [];
  let prev = altAt(0);
  for (let m = STEP_MIN; m <= 24 * 60; m += STEP_MIN) {
    const cur = altAt(m);
    if (prev === 0 || cur === 0 || prev * cur < 0) {
      brackets.push({ lo: m - STEP_MIN, hi: m });
    }
    prev = cur;
  }

  if (brackets.length === 0) return null;

  // Classify rising vs setting by the SIGN of altAt(lo): if negative there
  // and positive at hi, the sun is rising through the target.
  const matching = brackets.filter(({ lo, hi }) => {
    const rising = altAt(lo) < altAt(hi);
    return direction === "rising" ? rising : !rising;
  });

  if (matching.length === 0) return null;

  // If multiple matches (rare — only on polar twilight days), pick the one
  // closest to typical wall-clock time for that event. Rising → earliest
  // matching bracket; setting → latest matching bracket.
  const bracket =
    direction === "rising"
      ? matching[0]
      : matching[matching.length - 1];

  // Binary-search within the bracket to ~1 second.
  let lo = bracket.lo;
  let hi = bracket.hi;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const a = altAt(mid);
    const aLo = altAt(lo);
    if (a === 0) {
      lo = hi = mid;
      break;
    }
    if (a * aLo < 0) hi = mid;
    else lo = mid;
  }

  const found = new Date(dayStart);
  found.setSeconds(Math.round((lo + hi) * 30)); // (avg minutes) * 60 / 2
  return found;
}

// ---------------------------------------------------------------------------
// Named solar events
// ---------------------------------------------------------------------------

export type SolarEventId =
  | "astronomicalDawn"
  | "nauticalDawn"
  | "civilDawn"
  | "sunrise"
  | "goldenHourMorning"
  | "noon"
  | "goldenHourEvening"
  | "sunset"
  | "magicHour"
  | "blueHour"
  | "civilDusk"
  | "astronomicalDusk";

export interface SolarEventDef {
  id: SolarEventId;
  label: string;
  /** Sun altitude in degrees at the event. */
  altitudeDeg: number;
  /** Whether the sun is rising or setting at that moment. */
  direction: "rising" | "setting";
}

/**
 * Cinematographer-friendly named events. Altitudes follow standard
 * astronomical convention (civil = -6°, nautical = -12°, astronomical =
 * -18°). "Golden hour" is the warm-light window when the sun is between
 * about -4° and +6°; we anchor the preset at +6° going down (morning) and
 * the symmetric value going up. "Magic hour" anchors at the brief
 * sun-just-below-horizon window where sky still glows but artificial
 * lights start to read.
 */
export const SOLAR_EVENTS: SolarEventDef[] = [
  { id: "astronomicalDawn", label: "Astronomical dawn", altitudeDeg: -18, direction: "rising" },
  { id: "nauticalDawn", label: "Nautical dawn", altitudeDeg: -12, direction: "rising" },
  { id: "civilDawn", label: "Civil dawn", altitudeDeg: -6, direction: "rising" },
  { id: "sunrise", label: "Sunrise", altitudeDeg: -0.83, direction: "rising" },
  { id: "goldenHourMorning", label: "Golden (AM)", altitudeDeg: 6, direction: "rising" },
  { id: "goldenHourEvening", label: "Golden (PM)", altitudeDeg: 6, direction: "setting" },
  { id: "sunset", label: "Sunset", altitudeDeg: -0.83, direction: "setting" },
  { id: "magicHour", label: "Magic hour", altitudeDeg: -2, direction: "setting" },
  { id: "blueHour", label: "Blue hour", altitudeDeg: -4, direction: "setting" },
  { id: "civilDusk", label: "Civil dusk", altitudeDeg: -6, direction: "setting" },
  { id: "astronomicalDusk", label: "Astronomical dusk", altitudeDeg: -18, direction: "setting" },
];

/**
 * Resolve a named solar event to an absolute Date on the same calendar day
 * as `date`, for the given lat/lng. Returns null when the event doesn't
 * occur that day (polar latitudes / extreme dates).
 */
export function findNamedSolarEvent(
  date: Date,
  lat: number,
  lng: number,
  id: SolarEventId
): Date | null {
  const def = SOLAR_EVENTS.find((e) => e.id === id);
  if (!def) return null;
  return findSolarEvent(date, lat, lng, def.altitudeDeg, def.direction);
}

/**
 * Find solar noon (sun's highest altitude) for the given day/lat/lng. Used
 * as a "Noon" preset since findSolarEvent doesn't solve extrema (no
 * crossing). Ternary search over minutes-of-day, capped at ~1-minute
 * precision.
 */
export function findSolarNoon(date: Date, lat: number, lng: number): Date {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const altAt = (minutes: number): number => {
    const d = new Date(dayStart);
    d.setMinutes(minutes);
    return getSolarPosition(d, lat, lng).altitude;
  };
  let lo = 0;
  let hi = 24 * 60;
  for (let i = 0; i < 48; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (altAt(m1) < altAt(m2)) lo = m1;
    else hi = m2;
  }
  const noon = new Date(dayStart);
  noon.setSeconds(Math.round(((lo + hi) / 2) * 60));
  return noon;
}
