const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export type Coords = { lat: number; lng: number };

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Location privacy
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A citizen's raw GPS fix is their home address. Publishing it on a public,
 * crowd-sourced civic map lets anyone with three reports triangulate where a
 * person lives, which is a stalking and doxxing vector — especially dangerous
 * for people reporting on broken streetlights outside their own home.
 *
 * So the raw fix is treated as sensitive in-memory-only data:
 *
 *   • It is never sent to the server. Proximity queries use an obfuscated
 *     centre instead, so exact coordinates never appear in Convex query
 *     arguments, function logs, or the dashboard.
 *   • A report stores a slightly offset pin rather than the exact position.
 *   • Distances shown to the user are recomputed locally from the in-memory
 *     fix, so the UX stays accurate without leaking anything.
 *
 * These radii are the *maximum* random offset applied, chosen to be large
 * enough to defeat triangulation but small enough to remain useful.
 */
export const LOCATION_PRIVACY_QUERY_M = 1500;
export const LOCATION_PRIVACY_STORE_M = 250;

/**
 * Randomly displace a coordinate uniformly across a disc of `maxMeters`.
 *
 * The radius is sampled as `R * sqrt(u)` rather than `R * u` so the offset is
 * uniform over the disc's area. A uniform-in-radius offset would cluster points
 * at the centre and leak information through the offset distribution.
 */
export function obfuscateCoords(
  lat: number,
  lng: number,
  maxMeters: number,
): Coords {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || maxMeters <= 0) {
    return { lat, lng };
  }

  const offsetKm = Math.sqrt(Math.random()) * (maxMeters / 1000);
  const bearing = Math.random() * 2 * Math.PI;

  // Metres per degree of latitude is near-constant; longitude shrinks by the
  // cosine of latitude, which is clamped so poles cannot produce Infinity.
  const metresPerDegLat = 111_320;
  const metresPerDegLng = 111_320 * Math.max(0.01, Math.cos(toRad(lat)));

  const nextLat = lat + (offsetKm * 1000 * Math.cos(bearing)) / metresPerDegLat;
  const nextLng = lng + (offsetKm * 1000 * Math.sin(bearing)) / metresPerDegLng;

  return {
    lat: Number(nextLat.toFixed(6)),
    lng: Number(((nextLng + 540) % 360) - 180), // normalise across the dateline
  };
}

/** Great-circle distance between two coordinates, in kilometres. */
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Offset a coordinate by a distance/bearing — used by the manual pin tool. */
export function offsetCoords(
  lat: number,
  lng: number,
  meters: number,
  bearingDeg: number,
): Coords {
  const metresPerDegLat = 111_320;
  const metresPerDegLng = 111_320 * Math.max(0.01, Math.cos(toRad(lat)));
  const bearing = toRad(bearingDeg);
  return {
    lat: Number((lat + (meters * Math.cos(bearing)) / metresPerDegLat).toFixed(6)),
    lng: Number(
      (((lng + (meters * Math.sin(bearing)) / metresPerDegLng + 540) % 360) - 180).toFixed(6),
    ),
  };
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return "—";
  // Coarse rounding: never imply precision the privacy model cannot support.
  if (km < 1) return `${Math.max(50, Math.round(km / 50) * 50)} m`;
  if (km < 10) return `${(Math.round(km * 10) / 10).toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function formatCoord(lat: number, lng: number): string {
  return `${toDeg(toRad(lat)).toFixed(4)}, ${toDeg(toRad(lng)).toFixed(4)}`;
}
